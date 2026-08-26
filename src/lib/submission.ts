/**
 * What the Submit page sends, and when it is allowed to send anything at all.
 *
 * Pure functions, no React, no network. Extracted from Submit.tsx on 2026-08-26
 * when the picker replaced free-text entry, because the two rules that matter
 * most on that page are both invisible in JSX: which selections are submittable,
 * and which fields go on the wire. A `disabled` prop buried in a button's style
 * object is not a place to state a contract, and a body assembled inline is not a
 * place anybody will find the three fields that are deliberately absent.
 *
 * THE PAYLOAD CONTRACT
 * ────────────────────
 * Recorded in prose in PreviewAccountSearch.tsx's header and enforced here.
 * Four rules, three of which are refusals:
 *
 *   `url` follows the confirmed domain. Not `primary_domain`, not the first entry
 *   in the DOMAINS__C cell, and not anything the AE typed into a search box.
 *
 *   `whitespace_status` is sent explicitly rather than left to be derived. The
 *   Worker derives it when absent, but derivation can only ever produce the two
 *   values the body already implies — it cannot produce 'unresolved', and that is
 *   the value that matters. A lookup that failed is not a net-new prospect. This
 *   client cannot currently reach 'unresolved' (a search error clears the results
 *   and leaves nothing selectable), so the Worker's refusal is for the clients
 *   that follow; sending the field is what keeps the door in one place.
 *
 *   `usage_known` is NOT sent. It is derived at the Worker, so a client cannot
 *   assert usage alongside a no_record declaration.
 *
 *   `domain_confirmed` is NOT sent either — same principle from the other side.
 *   It is a gate on the client, not a claim about the account: anybody able to
 *   send `domain_confirmed: true` could send it without having asked a soul. What
 *   the Worker can rely on is that a `url` arrived, not that a client says
 *   somebody looked at it. Which is exactly why the gate has to be real HERE, and
 *   why it is a function with tests rather than a boolean in a style object.
 */

import type { AccountSelection } from '../components/AccountSearch';

/** Sent on the wire. `market` and `include_contacts` are Submit's own fields. */
export interface SubmitBody {
  company: string;
  url: string;
  include_contacts: boolean;
  market: string;
  /** Present only on the locked path. */
  whitespace_account_id?: string;
  /** Present, and `true`, only on the net-new path. */
  no_whitespace_data?: boolean;
  whitespace_status: 'matched' | 'no_record';
  domain_source: 'whitespace' | 'user_entered';
}

export type Readiness =
  | { ready: true }
  /**
   * `reason` is shown to the AE, so it says what to do rather than what is
   * missing from a payload.
   */
  | { ready: false; reason: string };

/**
 * Is this selection a submittable request?
 *
 * The gate the contract above puts on the client. Four ways to fail and one to
 * pass, and the interesting one is the second: a whitespace account whose domain
 * has not been confirmed is NOT submittable, including when the account holds
 * exactly one domain. The confirm step exists because somebody has to have
 * looked, and auto-confirming a single-domain account would be deciding that
 * nobody needs to look when the list is short — which is how 1,010 accounts came
 * to be locked to a domain Salesforce does not consider theirs.
 */
export function submissionReadiness(selection: AccountSelection | null): Readiness {
  if (!selection) {
    return { ready: false, reason: 'Choose the account this brief is about.' };
  }

  if (selection.kind === 'new_prospect') {
    // The typed domain is validated by parseDomainInput before the selection is
    // ever created, so a NewProspectSelection with no domain cannot be built by
    // the picker. Checked anyway: this function is the gate, and a gate that
    // trusts its caller is not one.
    if (!selection.domain) {
      return { ready: false, reason: 'Enter the domain to research.' };
    }
    return { ready: true };
  }

  if (!selection.domain_confirmed) {
    return {
      ready: false,
      reason: selection.domain_options.length === 0
        ? 'This account holds no domain — enter one to research.'
        : 'Confirm the research domain before submitting.',
    };
  }
  if (!selection.domain) {
    // Only reachable if a host mutated the selection: the confirm button is
    // disabled without a domain and the typed path validates before confirming.
    return { ready: false, reason: 'This account has no research domain.' };
  }
  return { ready: true };
}

/**
 * Build the `/submit` body for a ready selection.
 *
 * Throws on an unready one rather than returning a partial body. A caller that
 * has not checked `submissionReadiness` is a bug, and the failure it would
 * otherwise cause — a run dispatched against an unconfirmed domain — is the one
 * this whole feature exists to prevent, so it fails loudly and locally instead.
 */
export function buildSubmitBody(
  selection: AccountSelection | null,
  opts: { market: string; includeContacts: boolean },
): SubmitBody {
  const gate = submissionReadiness(selection);
  if (!gate.ready || !selection) {
    throw new Error(`Not submittable: ${gate.ready ? 'no selection' : gate.reason}`);
  }

  const common = {
    // The canonical name off the whitespace record, or — on the net-new path —
    // the company as the AE spelled it, because there is no canonical form to
    // prefer. Never the raw search query on the locked path: "entur" is what was
    // typed and "Entur AS" is what the brief is about.
    company: selection.name,
    // https:// unconditionally. Both paths hold a bare apex domain by this point
    // (rankDomains yields bare domains, parseDomainInput strips the scheme), so
    // there is nothing to normalise and nothing to validate — which is why the
    // old normaliseUrl/isValidUrl pair went with the free-text field.
    url: `https://${selection.domain}`,
    include_contacts: opts.includeContacts,
    market: opts.market,
  };

  if (selection.kind === 'new_prospect') {
    return {
      ...common,
      // A positive statement, not the absence of one. Omitting
      // whitespace_account_id alone would only mean "nothing was decided here",
      // which leaves M1.5 free to match the typed name as free text — the
      // wrong-company path. This says the book was searched and has no row.
      no_whitespace_data: true,
      whitespace_status: 'no_record',
      // Typed by hand, checked against nothing. The guards downstream depend on
      // knowing that, which is why it is stated rather than inferred from the
      // status.
      domain_source: 'user_entered',
    };
  }

  return {
    ...common,
    whitespace_account_id: selection.account_id,
    whitespace_status: 'matched',
    // 'whitespace' on an ordinary account; 'user_entered' on one of the 567 that
    // hold no domain, where the account is real and only the domain was typed.
    // Both are `matched` — the lock resolved, and where the domain came from is a
    // separate fact.
    domain_source: selection.domain_source,
  };
}
