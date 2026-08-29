/**
 * The post-submit confirmation.
 *
 * The assertions worth having are about what is NOT on it and about which
 * outcomes reach it at all, because both are easy to get wrong in a way nothing
 * visible catches:
 *
 *   - The figures are absent on purpose. ARR, seats and whitespace are what the
 *     brief will contain, not what was submitted, and a receipt that shows them
 *     invites being read as a result. A later hand adding "the account card again,
 *     for context" would break that with no test to stop it.
 *   - A hand-typed domain must never show the green "confirmed" chip. Both the
 *     net-new path and the 567 no-domain accounts land here with a domain nothing
 *     verified, and the whole point of `domain_source` is that the difference
 *     survives to where somebody reads it.
 *   - "View in My Briefs" goes to the list, not to /briefs/:id. On an immediate
 *     dispatch the brief does not exist yet.
 */

import { describe, test, expect, vi } from 'vitest';
// fireEvent rather than user-event, and toBeTruthy/toBeNull rather than jest-dom
// matchers: the repo carries neither dependency and there is no setup file, so this
// follows the house style in ClaimAudit.test.tsx instead of adding to the tree.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SubmitConfirmation, { type SubmittedRun } from './SubmitConfirmation';
import type { QueueStatus } from '../lib/queue-status';
import type { AccountSelection, WhitespaceCandidate } from './AccountSearch';

/** Entur AS — the account the wrong-company failure was found on. Real row. */
const ENTUR: WhitespaceCandidate = {
  account_id: '0013u00001GP1HQAA1',
  name: 'Entur AS',
  arr: 58020,
  sales_segment: 'MM',
  region: 'UKINN',
  billing_country: 'Norway',
  total_whitespace: 49482,
  website: 'www.entur.no',
  account_owner: 'George Harding',
  employees: 227,
  full_seats: 69,
  dev_seats: 36,
  loaded_at: '2026-08-26T07:52:08.733542+00:00',
  domains: ['entur.org', 'entur.no'],
  primary_domain: 'entur.org',
  rank_tier: 1,
  match: 'name_exact',
  matched_on: 'name',
};

const locked = (over: Partial<Extract<AccountSelection, { kind: 'whitespace_account' }>> = {}) =>
  ({
    kind: 'whitespace_account' as const,
    account_id: ENTUR.account_id,
    name: ENTUR.name,
    domain: 'entur.no',
    domain_confirmed: true,
    domain_options: [],
    domain_source: 'whitespace' as const,
    candidate: ENTUR,
    ...over,
  });

const NEW_PROSPECT: AccountSelection = {
  kind: 'new_prospect',
  account_id: null,
  name: 'Northwind Robotics',
  domain: 'northwindrobotics.example',
  no_whitespace_data: true,
};

/**
 * `pollQueue` defaults to a stub that answers "nothing new". Without it a queued
 * render would start a real interval against the production Worker through
 * `workerFetch`, which in jsdom means an unauthenticated call on a timer for the
 * life of the test file. Injecting it is also how the live-refresh assertions
 * below drive the screen without a network.
 */
const show = (
  submitted: SubmittedRun,
  onSubmitAnother = () => {},
  pollQueue: (runId: string) => Promise<QueueStatus | null> = async () => null,
) =>
  render(
    <MemoryRouter>
      <SubmitConfirmation
        submitted={submitted}
        onSubmitAnother={onSubmitAnother}
        pollQueue={pollQueue}
        pollIntervalMs={20}
      />
    </MemoryRouter>,
  );

const status = (over: Partial<QueueStatus> = {}): QueueStatus => ({
  run_id: dispatched.runId!,
  status: 'queued',
  queue_position: 1,
  estimated_wait_minutes: 2,
  queued_reason: 'no-token',
  in_flight: 5,
  ...over,
});

const dispatched: SubmittedRun = {
  selection: locked(),
  market: 'auto',
  runId: '18c5bf5b-338f-4726-9dd6-cbb6df976b95',
};

describe('a dispatched run', () => {
  test('says it was submitted, and names the account and domain', () => {
    show(dispatched);
    expect(screen.getByText(/research submitted/i)).toBeTruthy();
    expect(screen.getByText('Entur AS')).toBeTruthy();
    expect(screen.getByText('entur.no')).toBeTruthy();
  });

  test('the domain came off the record, so it reads confirmed', () => {
    show(dispatched);
    expect(screen.getByText(/confirmed/i)).toBeTruthy();
    expect(screen.queryByText(/entered by hand/i)).toBeNull();
  });

  test('the Salesforce ID is a link to the account', () => {
    show(dispatched);
    const link = screen.getByRole('link', { name: /0013u00001GP1HQAA1/ });
    expect(link.getAttribute('href')).toContain('/lightning/r/Account/0013u00001GP1HQAA1/view');
  });

  test('the run id is shown, for the "my brief looks wrong" conversation', () => {
    show(dispatched);
    expect(screen.getByText(dispatched.runId!)).toBeTruthy();
  });

  // The one a later "add the card back for context" would break.
  test('shows none of the account figures', () => {
    const { container } = show(dispatched);
    const text = container.textContent || '';
    for (const figure of ['58,020', '58020', '$58K', '49,482', '49482', '$49K', 'George Harding']) {
      expect(text).not.toContain(figure);
    }
  });

  test('does not claim the brief is ready', () => {
    const { container } = show(dispatched);
    expect(container.textContent).toMatch(/around 15 minutes/i);
    expect(container.textContent).not.toMatch(/queue/i);
  });
});

describe('a queued run', () => {
  const queued: SubmittedRun = { ...dispatched, queue: { position: 2, waitMinutes: 24 } };

  test('is still a confirmation, not a warning', () => {
    show(queued);
    expect(screen.getByText(/research queued/i)).toBeTruthy();
  });

  test('carries the position and the wait instead of the 15-minute line', () => {
    const { container } = show(queued);
    expect(container.textContent).toMatch(/#2/);
    expect(container.textContent).toMatch(/~24 minutes/);
    expect(container.textContent).not.toMatch(/around 15 minutes/i);
  });
});

/**
 * The number on this screen used to be captured once at submit time and never
 * touched again — twenty minutes later it still said what was true when the
 * button was pressed. These are the assertions that it moves.
 */
describe('the queued number is live, not a snapshot', () => {
  const queued: SubmittedRun = { ...dispatched, queue: { position: 4, waitMinutes: 40 } };

  test('the poll replaces the submit-time position and wait', async () => {
    const { container } = show(queued, () => {}, async () => status({ queue_position: 1, estimated_wait_minutes: 2 }));
    // The snapshot renders first — there is nothing else to show yet.
    expect(container.textContent).toMatch(/#4/);
    await waitFor(() => expect(container.textContent).toMatch(/#1/));
    expect(container.textContent).toMatch(/~2 minutes/);
    expect(container.textContent).not.toMatch(/~40 minutes/);
  });

  test('keeps polling, so a queue that moves twice is followed twice', async () => {
    let position = 3;
    const { container } = show(queued, () => {}, async () => status({ queue_position: position--, estimated_wait_minutes: 5 }));
    await waitFor(() => expect(container.textContent).toMatch(/#3/));
    await waitFor(() => expect(container.textContent).toMatch(/#2/));
    await waitFor(() => expect(container.textContent).toMatch(/#1/));
  });

  // A Worker without /queue-status — i.e. production, until the
  // admission-controller build is deployed. The screen must not blank.
  test('a poller that answers nothing leaves the snapshot standing', async () => {
    const { container } = show(queued, () => {}, async () => null);
    await new Promise(r => setTimeout(r, 60));
    expect(container.textContent).toMatch(/#4/);
    expect(container.textContent).toMatch(/~40 minutes/);
  });

  test('once the run starts, the screen says so and stops describing a queue', async () => {
    const { container } = show(queued, () => {}, async () => status({ status: 'running', queue_position: null, estimated_wait_minutes: null, queued_reason: null }));
    await waitFor(() => expect(screen.getByText(/research started/i)).toBeTruthy());
    expect(container.textContent).toMatch(/running now/i);
    expect(container.textContent).not.toMatch(/#\d/);
    expect(container.textContent).not.toMatch(/in the queue/i);
  });
});

/**
 * Which gate is holding the run. 'no-token' is a drip and nothing has to finish;
 * 'ceiling' is a genuine wait for capacity. Saying the second when the first is
 * true is how a 90-second wait reads as a stall.
 */
describe('the copy says WHY the run is queued', () => {
  const queued: SubmittedRun = { ...dispatched, queue: { position: 2, waitMinutes: 3 } };

  test('no-token reads as metered, not as blocked', async () => {
    const { container } = show(queued, () => {}, async () => status({ queued_reason: 'no-token', queue_position: 2, estimated_wait_minutes: 2 }));
    await waitFor(() => expect(container.textContent).toMatch(/starting shortly/i));
    expect(container.textContent).not.toMatch(/slot frees up/i);
  });

  test('ceiling names the number of briefs actually running', async () => {
    const { container } = show(queued, () => {}, async () => status({ queued_reason: 'ceiling', in_flight: 18, estimated_wait_minutes: 26 }));
    await waitFor(() => expect(container.textContent).toMatch(/waiting for capacity/i));
    expect(container.textContent).toMatch(/18 briefs are currently running/);
  });

  // The branch that runs today, on a /submit response that carries no reason.
  test('no reason at all keeps the copy that shipped', () => {
    const { container } = show(queued);
    expect(container.textContent).toMatch(/starts automatically when a slot frees up/i);
  });
});

describe('a hand-typed domain never reads as confirmed', () => {
  test('net-new prospect', () => {
    show({ selection: NEW_PROSPECT, market: 'auto', runId: 'r1' });
    expect(screen.getByText(/entered by hand/i)).toBeTruthy();
    expect(screen.queryByText(/^confirmed$/i)).toBeNull();
    expect(screen.getByText(/none — new prospect/i)).toBeTruthy();
    // The thing an AE would otherwise be surprised by on opening the brief.
    expect(screen.getByText(/unknown, which is not the same as zero/i)).toBeTruthy();
  });

  // One of the 567 accounts the book holds with no domain. The lock is real, so
  // the Salesforce link is there; only the domain was typed.
  test('locked account whose domain was typed', () => {
    show({
      selection: locked({ domain: 'apple.com', domain_source: 'user_entered' }),
      market: 'auto',
      runId: 'r2',
    });
    expect(screen.getByText(/entered by hand/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /0013u00001GP1HQAA1/ })).toBeTruthy();
    // NOT the net-new note — this account has a whitespace record.
    expect(screen.queryByText(/not the same as zero/i)).toBeNull();
  });
});

describe('the actions', () => {
  test('goes to the briefs list, not to a brief that does not exist yet', () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <SubmitConfirmation submitted={dispatched} onSubmitAnother={() => {}} onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /view in my briefs/i }));
    expect(onNavigate).toHaveBeenCalledWith('/my-briefs');
  });

  test('"Submit another" calls back rather than navigating', () => {
    const onSubmitAnother = vi.fn();
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <SubmitConfirmation submitted={dispatched} onSubmitAnother={onSubmitAnother} onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /submit another/i }));
    expect(onSubmitAnother).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('the language is reported by name', () => {
  test.each([
    ['auto', 'Auto-detect'],
    ['no', 'Norwegian'],
    ['ja', 'Japanese'],
  ])('%s -> %s', (market, label) => {
    show({ ...dispatched, market });
    expect(screen.getByText(label)).toBeTruthy();
  });
});
