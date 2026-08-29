import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStatus } from '../context/StatusContext';
import Layout from '../components/Layout';
import Banner from '../components/Banner';
import AccountSearch, { type AccountSelection } from '../components/AccountSearch';
import SubmitConfirmation, { type SubmittedRun } from '../components/SubmitConfirmation';
import { supabase, workerFetch } from '../lib/supabase';
import { submissionReadiness, buildSubmitBody, confirmedDomain } from '../lib/submission';
import {
  LANGUAGE_OPTIONS, LANGUAGE_LABEL, initialLanguageState, nextLanguageState,
  overrideLanguage, acceptSuggestion, declineSuggestion,
} from '../lib/language-detect';
import { getDomainCheck } from '../lib/preview-settings';
import usePageTitle from '../hooks/usePageTitle';
import useWindowWidth from '../hooks/useWindowWidth';

/**
 * Submit — the one page that spends a credit and dispatches a run.
 *
 * Free-text company and website entry was removed on 2026-08-26. It had been the
 * production path for all 259 briefs ever generated, every one of which resolved
 * its whitespace account by searching that text for a substring match — which is
 * how a brief titled Entur came back carrying Accenture's $10.3M ARR and 186,763
 * developers. The field is now the account picker: a real `whitespace_accounts`
 * row, chosen from candidates, and a domain confirmed by hand.
 *
 * What that changes about this file
 * ────────────────────────────────
 * `company` and `url` are no longer state. They are derived from the selection at
 * submit time by `lib/submission`, which also holds the payload contract and the
 * gate. Nothing here assembles a request body inline any more, and nothing
 * normalises a URL: both paths out of the picker hold a bare apex domain already,
 * so `normaliseUrl` and `isValidUrl` went with the field that needed them.
 *
 * Everything else on the page is untouched — the credit counter, the duplicate
 * warning, the language select, the feedback-gate panel, the credit-request modal
 * and the API-degraded notice all behave exactly as they did. The floating
 * post-submit toast is gone — see "After a successful submit" below.
 *
 * The gate
 * ────────
 * A selection with `domain_confirmed: false` is an incomplete request and the
 * submit button is disabled on it. Deliberately NOT auto-confirmed when the
 * account holds exactly one domain: the confirm step exists because somebody has
 * to have looked, and 1,010 accounts are locked to a domain Salesforce does not
 * consider theirs precisely because nobody ever was. The reason the button is off
 * is printed under it rather than left for the AE to work out.
 *
 * The gate is enforced twice, which is not belt-and-braces. `submitEnabled`
 * disables the button; `buildSubmitBody` throws on an unready selection. The
 * first is an affordance and the second is the invariant — a stray Enter on the
 * form, or a later edit that drops the `disabled` prop, reaches the second.
 *
 * After a successful submit
 * ────────────────────────
 * The form is REPLACED by `SubmitConfirmation`, not reset behind a banner. The
 * first cut reset `selection` to null and left the form standing, which was worse
 * than clunky: `AccountSearch` keeps its own `query` and result cache, so the
 * search effect re-ran, hit that cache and re-opened the dropdown over the page —
 * dropping the AE back into a half-typed search for the company they had just
 * submitted, with the success banner rendering underneath the open dropdown.
 *
 * Replacing the form unmounts the picker, so that whole class of stale-state bug
 * cannot arise and no extra resetting is needed. `submitted` is the switch; it
 * holds what was sent, because `selection` is gone by then.
 *
 * A cache hit is NOT a submission and does not get the confirmation. `{cached:
 * true}` means no run was dispatched and no credit spent — the form stays up with
 * an informational banner. A QUEUED run does get it: the credit is spent and the
 * row exists, so it is submitted, just not started.
 *
 * Nothing in the picker path can dispatch
 * ──────────────────────────────────────
 * The picker's only network calls are `GET /account-search` and
 * `POST /domain-check`. `handleSubmit` is the sole caller of `/submit` on this
 * page and it runs from the form's submit event alone. Selecting an account,
 * moving the radio, confirming a domain and taking the net-new fork all go
 * through `onChange` and touch no endpoint that costs anything.
 */

type BannerType = 'info' | 'warning' | 'error' | 'success';

interface BannerState {
  type: BannerType;
  msg: string;
  runId?: string;
}

// The select's options live in ../lib/language-detect, next to the TLD map that
// fills it. There were two copies of this list — here and in
// SubmitConfirmation — and both had drifted: neither offered Danish or Finnish,
// while '.dk' and '.fi' have been in the detection map the whole time. A
// detected language the select cannot render leaves it showing nothing.

export default function Submit() {
  usePageTitle('Submit');
  return (
    <Layout>
      <SubmitBody />
    </Layout>
  );
}

interface BodyProps {
  /**
   * Injectable so the screenshot harness drives the picker off fixtures rather
   * than the live endpoint. Undefined on the route above, which is what makes the
   * page people use the real one.
   */
  fetcher?: typeof workerFetch;
  /** Pre-seeded selection, for the harness only. */
  initialSelection?: AccountSelection | null;
  /**
   * Starting state of the advisory domain check. Undefined means "whatever
   * Admin → Preview says", which on a browser that has never set it is on.
   */
  initialDomainCheck?: boolean;
  /** Pre-seeded confirmation, for the harness only. */
  initialSubmitted?: SubmittedRun | null;
  /**
   * Injected by the harness, which renders outside a Router. Passed through to
   * the confirmation's navigation buttons.
   */
  onNavigate?: (path: string) => void;
}

/**
 * The page body, minus the app chrome.
 *
 * Split out for the reason `AccountSearchPreviewBody` was: the screenshot harness
 * renders exactly this — the same component tree in the same order — rather than
 * an approximation that can drift from what ships. Auth and status come through
 * their contexts, which the harness provides.
 */
export function SubmitBody({
  fetcher,
  initialSelection = null,
  initialDomainCheck,
  initialSubmitted = null,
  onNavigate,
}: BodyProps) {
  const { session, userProfile, refreshProfile } = useAuth();
  const { indicator } = useStatus();
  const isDown = indicator === 'major' || indicator === 'critical';
  const isMobile = useWindowWidth() <= 768;

  /**
   * The whole of "which company is this brief about". One field where there were
   * two, and it carries a Salesforce ID rather than a string to be re-matched
   * later.
   */
  const [selection, setSelection] = useState<AccountSelection | null>(initialSelection);
  /**
   * The language the brief is researched and written in, and where that value
   * came from.
   *
   * This used to default to 'auto' and stay there, which meant the detection ran
   * inside the pipeline — after Run had been pressed, with nothing on screen to
   * correct. On the portal path it never ran at all: 'auto' became
   * `home_language=english` at the Worker, and app.js skips its own detection
   * when a language is named. `runs.market` has never once held 'no', 'sv' or
   * 'nl' across ~346 runs.
   *
   * It SUGGESTS rather than switches. `--home-language` drives the localised
   * research pass and the output language, so a detection acted on silently
   * means the whole brief comes back in Norwegian on the strength of a TLD, with
   * a 12px line under the select as the only notice. English stays until
   * somebody clicks.
   *
   * The rule — resolve once per confirmed domain, keep an answer against the
   * current one, ask again when the domain changes — is in lib/language-detect,
   * next to the TLD map, so it is testable without a DOM and the reasoning sits
   * with the data it reasons about.
   */
  const [language, setLanguage] = useState(() => initialLanguageState(confirmedDomain(initialSelection)));
  const market = language.code;

  /**
   * Detect the moment a domain is CONFIRMED, not before.
   *
   * Keyed on the confirmed domain — see confirmedDomain() in lib/submission. The
   * ranked suggestion the picker shows before the confirm click is not an
   * answer; it is the thing the confirm step exists to interrogate. Detecting
   * from it would show a language derived from a domain nobody has agreed to,
   * then change it under them when they agree to a different one.
   */
  const confirmed = confirmedDomain(selection);
  useEffect(() => {
    setLanguage(prev => nextLanguageState(prev, confirmed) ?? prev);
  }, [confirmed]);

  const [includeContacts] = useState(true); // Always include contacts — M2 now ~$0.02 via Apollo
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  /**
   * Non-null once a run has actually been dispatched or queued. While it is set,
   * the confirmation replaces the form.
   *
   * Holds its own copy of what was sent rather than reading `selection`, which is
   * cleared at the same moment — and rather than reading the run row back, which
   * would be a round trip to learn something this page already knew.
   */
  const [submitted, setSubmitted] = useState<SubmittedRun | null>(initialSubmitted);
  const [duplicate, setDuplicate] = useState<{ name: string; days: number; user: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  /**
   * The advisory domain check, read once at mount and not subscribed to.
   *
   * Its off-switch is in Admin → Preview and is per browser, which is a real
   * limit now that this page is used by 194 people rather than by the one admin
   * who could reach the preview: an AE's browser has nothing stored, so for them
   * the check is on and there is no way to turn it off short of a deploy. Left as
   * it stands rather than moved to a table, because the failure it would guard
   * against degrades to a `couldn't check` chip the UI already renders and which
   * blocks nothing.
   */
  const [domainCheck] = useState(() => initialDomainCheck ?? getDomainCheck());

  // Feedback gate state
  const [feedbackBlocked, setFeedbackBlocked] = useState<{ run_id: string; title: string; created_at: string }[]>([]);

  // Credit request modal state
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(5);
  const [creditReason, setCreditReason] = useState('');
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditResult, setCreditResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const call = fetcher ?? workerFetch;
  const readiness = submissionReadiness(selection);
  const submitEnabled = readiness.ready && !submitting;

  useEffect(() => { refreshProfile(); }, [refreshProfile]);

  const checkDuplicate = useCallback(async (name: string) => {
    if (name.length < 3) { setDuplicate(null); return; }
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    try {
      const { data } = await supabase
        .from('runs')
        .select('company, created_at, user_id, users!runs_user_id_fkey!inner(name)')
        .eq('status', 'complete')
        .ilike('company', name)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const run = data[0] as any;
        const days = Math.floor((Date.now() - new Date(run.created_at).getTime()) / 86400000);
        setDuplicate({ name: run.company, days, user: run.users?.name || 'someone' });
      } else {
        setDuplicate(null);
      }
    } catch {
      setDuplicate(null);
    }
  }, []);

  /**
   * The duplicate check runs on the CANONICAL account name now, rather than on
   * every keystroke of a free-text field.
   *
   * Cheaper — one query per selection instead of one per 600ms of typing — and
   * more accurate: `runs.company` holds the normalised name a previous run was
   * filed under, and "Entur AS" matches a previous Entur brief where the four
   * characters somebody happened to stop typing at would not. The debounce stays
   * for an AE flicking between two candidates.
   */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!selection) { setDuplicate(null); return; }
    const name = selection.name;
    debounceRef.current = setTimeout(() => checkDuplicate(name), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selection, checkDuplicate]);

  // Check for in-progress run on mount
  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      const cutoff = new Date(Date.now() - 60 * 60000).toISOString();
      const { data } = await supabase
        .from('runs')
        .select('company, status')
        .eq('user_id', userProfile.id)
        .in('status', ['running', 'queued'])
        .gte('created_at', cutoff)
        .limit(1);
      if (data && data.length > 0) {
        const label = data[0].status === 'queued' ? 'queued' : 'in progress';
        setBanner({ type: 'info', msg: `You have a run ${label} for "${data[0].company}". Check My Briefs for updates.` });
      }
    })();
  }, [userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    if (!session) return;

    // The invariant, not the affordance. `buildSubmitBody` throws on an unready
    // selection; this turns that into a message and never proceeds. There is no
    // URL validation left to do — the domain came off the record, or through
    // parseDomainInput.
    let body;
    try {
      body = buildSubmitBody(selection, { market, includeContacts });
    } catch {
      setBanner({ type: 'error', msg: readiness.ready ? 'Nothing to submit.' : readiness.reason });
      return;
    }

    setSubmitting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await call('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 403) {
        const data = await res.json();
        if (data.error === 'feedback_gate' && data.blockedBy) {
          setFeedbackBlocked(data.blockedBy);
          setBanner({ type: 'error', msg: `You need to submit feedback on ${data.blockedBy.length} brief(s) before running a new one.` });
        } else {
          setBanner({ type: 'error', msg: data.message || 'Forbidden' });
        }
      } else if (res.status === 402) {
        setBanner({ type: 'error', msg: 'No credits remaining.' });
        openCreditModal();
      } else if (res.status === 409) {
        setBanner({ type: 'warning', msg: 'A run for this company is already in progress.' });
      } else if (res.ok) {
        const data = await res.json();
        if (data.cached && !data.stale) {
          setBanner({
            type: 'info',
            msg: `Using cached brief (${data.age_days} days old).`,
            runId: data.run_id,
          });
        } else if (data.cached && data.stale) {
          setBanner({
            type: 'warning',
            msg: `Brief is ${data.age_days} days old. Submit again for a fresh run.`,
            runId: data.run_id,
          });
        } else if (data.status === 'queued') {
          // Queued is submitted. The credit is spent and the row exists, so it
          // gets the confirmation rather than a warning banner — with the queue
          // position in place of the "~15 minutes" line.
          //
          // These are the numbers AT SUBMIT TIME. They are the confirmation's
          // starting point, not its final word: it re-reads them from
          // /queue-status/:runId while it is on screen.
          setSubmitted({
            selection: selection!,
            market,
            runId: data.run_id,
            queue: {
              position: data.queue_position ?? null,
              waitMinutes: data.estimated_wait_minutes ?? null,
              // Which gate is holding it. Undefined against a Worker without the
              // admission-controller build, and the confirmation's copy falls
              // back to the generic line on exactly that.
              reason: data.queued_reason ?? null,
              inFlight: data.in_flight ?? null,
            },
          });
          setSelection(null);
        } else {
          // No success banner and no toast. The confirmation says it, in the place
          // the AE is already looking; the banner used to render underneath a
          // reopened dropdown, and the toast repeated the same sentence a third
          // time in the corner.
          setSubmitted({ selection: selection!, market, runId: data.run_id });
          setSelection(null);
        }
        refreshProfile();
      } else {
        const text = await res.text();
        setBanner({ type: 'error', msg: text || `Error ${res.status}` });
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setBanner({ type: 'warning', msg: 'Still working... check My Briefs for updates.' });
      } else {
        setBanner({ type: 'error', msg: err.message || 'Network error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openCreditModal = () => {
    setCreditModalOpen(true);
    setCreditResult(null);
    setCreditAmount(5);
    setCreditReason('');
  };

  const handleCreditSubmit = async () => {
    setCreditSubmitting(true);
    setCreditResult(null);
    try {
      const res = await call('/request-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: creditAmount, reason: creditReason || undefined }),
      });
      if (res.ok) {
        setCreditResult({ type: 'success', msg: 'Request submitted — your manager will be notified.' });
      } else {
        const text = await res.text();
        setCreditResult({ type: 'error', msg: text || `Error ${res.status}` });
      }
    } catch (err: any) {
      setCreditResult({ type: 'error', msg: err.message || 'Network error' });
    } finally {
      setCreditSubmitting(false);
    }
  };

  const credits = userProfile?.credits_remaining ?? 0;
  const creditsColor = credits <= 1 ? 'var(--status-running-text)' : 'var(--status-complete-text)';

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
    padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', width: '100%', outline: 'none',
  };

  /**
   * 13px, down from 14 — the one thing on this page that changed to fit the
   * picker rather than the other way round.
   *
   * Submit's three field labels were the only 14px text in the app: the body rule
   * is 13, inputs are 13, buttons are 12-13, card titles are 13, and the picker's
   * own label follows the rule. Two of the three labels are gone with the fields
   * they belonged to; leaving the survivor at 14 would have put two label sizes
   * in one four-line form.
   */
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6,
  };

  return (
    <>
      <div style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>New Research Request</h1>
          {!isMobile && (
            <span style={{ fontSize: 12, fontWeight: 500, color: creditsColor }}>
              {credits} credit{credits !== 1 ? 's' : ''} remaining
              {credits <= 2 && (
                <button onClick={openCreditModal} style={{
                  background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, marginLeft: 8, padding: 0, textDecoration: 'underline',
                }}>Request more</button>
              )}
            </span>
          )}
        </div>

        {/* Both of these are about a request being composed, so neither belongs
            next to a confirmation of one already sent. */}
        {!submitted && duplicate && (
          <Banner type="info" style={{ marginBottom: 16 }}>
            {duplicate.name} was researched {duplicate.days} day{duplicate.days !== 1 ? 's' : ''} ago by {duplicate.user}. View that brief in My Briefs or submit a fresh request.
          </Banner>
        )}

        {submitted ? (
          <SubmitConfirmation
            submitted={submitted}
            onNavigate={onNavigate}
            /* Back to a clean form. `selection` was already cleared at submit
               time, and the picker remounts from scratch because it was
               unmounted while the confirmation was up — which is what makes this
               a genuinely fresh form rather than a reset one. */
            onSubmitAnother={() => { setSubmitted(null); setBanner(null); }}
          />
        ) : (
        <form onSubmit={handleSubmit}>
          {/* Company and Website, which were two free-text inputs. The picker
              answers both questions, and answers them with a Salesforce record
              rather than a string. `allowNewProspect` because this page can cope
              with a submission carrying no whitespace record, which is exactly
              the condition that flag documents. */}
          <div style={{ marginBottom: 16 }}>
            <AccountSearch
              value={selection}
              onChange={setSelection}
              allowNewProspect
              domainCheck={domainCheck}
              label="Company"
              autoFocus={!initialSelection}
              disabled={submitting}
              fetcher={fetcher}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            {/* htmlFor/id, where the other fields on this page have neither.
                The select is now the thing that carries the answer rather than a
                deferral, so it is worth being reachable by name — to a screen
                reader, and to the test that asserts what it holds. */}
            <label htmlFor="submit-language" style={labelStyle}>Language</label>
            <select
              id="submit-language"
              value={market}
              /* Setting it by hand clears the detection note, because the value
                 is no longer detected. It re-detects if the confirmed domain
                 changes after this — that is the effect above, and it is the
                 right way round: the domain is what the detection reads. */
              onChange={e => setLanguage(prev => overrideLanguage(prev, e.target.value))}
              disabled={submitting}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)',
                fontSize: 13, width: '100%', cursor: 'pointer', outline: 'none',
              }}
            >
              {LANGUAGE_OPTIONS.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag}  {lang.label}
                </option>
              ))}
            </select>
            {/* The suggestion, and it is a suggestion — the select above still
                says English until this is answered.

                It asks rather than switches because the language is not a
                display setting: --home-language drives the localised research
                pass AND the output, so accepting this means the whole brief
                comes back in Norwegian. An earlier version set the select
                silently and announced it in the 12px line below, which is easy
                to press Run past — and the cost of not noticing is a brief the
                AE cannot read, discovered after the Opus call. */}
            {language.decision === 'pending' && language.detected && (
              <div style={{
                marginTop: 8, padding: '10px 12px',
                background: 'var(--bg-surface)', border: '1px solid #d97706',
                borderRadius: 6,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong>{language.forDomain}</strong> suggests{' '}
                  <strong>{LANGUAGE_LABEL[language.detected] ?? language.detected}</strong>.
                  {' '}The research and the finished brief would both be in{' '}
                  {LANGUAGE_LABEL[language.detected] ?? language.detected}, not English.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setLanguage(acceptSuggestion)}
                    style={{
                      background: 'var(--accent)', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '6px 12px', fontSize: 12,
                      fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    Use {LANGUAGE_LABEL[language.detected] ?? language.detected}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage(declineSuggestion)}
                    style={{
                      background: 'transparent', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-strong)', borderRadius: 6,
                      padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Keep English
                  </button>
                </div>
              </div>
            )}
            {/* Four states, four different sentences. The AE has to be able to
                tell "you accepted a suggestion", "the domain suggested something
                and you said no", "the domain suggested nothing" and "you chose
                this" apart. The old copy said only that detection would happen
                later, which it then didn't. */}
            {language.decision !== 'pending' && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {language.decision === 'accepted'
                  ? `From ${language.forDomain} — change it here if that is wrong`
                  : language.decision === 'declined'
                    ? `Staying in English — ${language.forDomain} suggested ` +
                      `${LANGUAGE_LABEL[language.detected!] ?? language.detected}`
                    : confirmed
                      ? `${confirmed} does not suggest a language — change this if the brief should not be in English`
                      : 'Confirm a domain above and we will suggest a language if the domain implies one'}
              </div>
            )}
          </div>

          {/* Contacts always included — M2 now ~$0.02 via Apollo (was ~$6.37 with EnrichLayer) */}

          <button
            type="submit" disabled={!submitEnabled}
            style={{
              width: '100%', background: 'var(--accent)', color: '#fff',
              padding: isMobile ? '12px 14px' : '8px 14px',
              height: isMobile ? 48 : undefined,
              fontSize: isMobile ? 15 : 13, fontWeight: 500, borderRadius: 6, border: 'none',
              opacity: submitEnabled ? 1 : 0.4,
              cursor: submitEnabled ? 'pointer' : 'not-allowed',
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => { if (submitEnabled) e.currentTarget.style.background = 'var(--accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          >
            {submitting ? 'Submitting...' : 'Run Research'}
          </button>

          {/* Why the button is off. A dimmed control with nothing beside it reads
              as a broken page, and the answer is always one action away — pick an
              account, or confirm the domain. */}
          {!readiness.ready && !submitting && (
            <div style={{
              fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6,
              textAlign: 'center', lineHeight: 1.5,
            }}>
              {readiness.reason}
            </div>
          )}

          {isMobile && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: creditsColor }}>
                {credits} credit{credits !== 1 ? 's' : ''} remaining
                {credits <= 2 && (
                  <button onClick={openCreditModal} style={{
                    background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, marginLeft: 8, padding: 0, textDecoration: 'underline',
                  }}>Request more</button>
                )}
              </span>
            </div>
          )}
          {isDown && (
            <p style={{ fontSize: 13, color: '#92400e', marginTop: 8 }}>
              {'⚠'} Anthropic API is currently experiencing issues. Your brief will be queued and will complete once the API recovers.
            </p>
          )}
        </form>
        )}

        {banner && (
          <div style={{ marginTop: 16 }}>
            <Banner type={banner.type}>
              {banner.msg}
              {banner.runId && (
                <div style={{ marginTop: 8 }}>
                  <a href={`#/briefs/${banner.runId}`}
                    style={{ color: 'inherit', textDecoration: 'underline', fontSize: 13 }}>
                    View Brief
                  </a>
                </div>
              )}
            </Banner>
          </div>
        )}

        {/* Feedback gate: blocked briefs list */}
        {feedbackBlocked.length > 0 && (
          <div style={{
            marginTop: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
              Briefs needing feedback:
            </div>
            {feedbackBlocked.map(b => (
              <div key={b.run_id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {new Date(b.created_at).toLocaleDateString()}
                  </div>
                </div>
                <a href={`#/briefs/${b.run_id}`} style={{
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500,
                }}>
                  Review &rarr;
                </a>
              </div>
            ))}
            <button
              onClick={() => { setFeedbackBlocked([]); setBanner(null); }}
              style={{
                marginTop: 12, background: 'transparent', border: '1px solid var(--border-strong)',
                borderRadius: 6, padding: '6px 14px', fontSize: 12, color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Check again
            </button>
          </div>
        )}
      </div>

      {/* ── Credit Request Modal ── */}
      {creditModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setCreditModalOpen(false)}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 12, padding: 24,
            width: '100%', maxWidth: 440, maxHeight: '80vh', overflow: 'auto',
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Request Credits</h2>
              <button onClick={() => setCreditModalOpen(false)} style={{
                background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
                color: 'var(--text-secondary)', lineHeight: 1,
              }}>{'×'}</button>
            </div>

            {creditResult?.type === 'success' ? (
              /* ── Success state ── */
              <div>
                <div style={{
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)',
                }}>
                  {creditResult.msg}
                </div>
                <button onClick={() => setCreditModalOpen(false)} style={{
                  width: '100%', marginTop: 16, padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                }}>Done</button>
              </div>
            ) : (
              /* ── Credit request form ── */
              <div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>How many credits?</label>
                  <input type="number" min={1} max={50} value={creditAmount}
                    onChange={e => setCreditAmount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    style={{
                      ...inputStyle, width: 80,
                    }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Reason (optional)</label>
                  <textarea value={creditReason} onChange={e => setCreditReason(e.target.value)}
                    placeholder="e.g. Preparing for QBR next week"
                    rows={3}
                    style={{
                      ...inputStyle, resize: 'vertical',
                    }} />
                </div>
                {creditResult?.type === 'error' && (
                  <div style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: '#dc2626',
                  }}>
                    {creditResult.msg}
                  </div>
                )}
                <button onClick={handleCreditSubmit} disabled={creditSubmitting} style={{
                  width: '100%', padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff',
                  cursor: creditSubmitting ? 'not-allowed' : 'pointer',
                  opacity: creditSubmitting ? 0.5 : 1,
                }}>
                  {creditSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
