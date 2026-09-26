import {ASSETS} from './config.js';
import {formatUnits} from './core.js';
import {activityStatusLabel} from './activity-status.js';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

export function createActivityView() {
  let locked = true, visible = true, records = [], warning = '', busy = false;
  function render() {
    const list = $('activity-list');
    // Remove sensitive nodes entirely when hidden; CSS hiding alone keeps
    // amounts and transaction identifiers available in the page DOM.
    list.replaceChildren();
    $('activity-toggle').hidden = locked;
    $('activity-clear').hidden = locked;
    $('activity-backup').hidden = locked;
    $('activity-toggle').textContent = visible ? 'Hide history' : 'Show history';
    $('activity-toggle').setAttribute('aria-expanded', String(!locked && visible));
    $('activity-state').textContent = locked ? 'Unlock your wallet to read its local history.'
      : !visible ? 'History hidden.'
      : warning || (records.length ? `${records.length} recent ${records.length === 1 ? 'activity' : 'activities'} on this browser.` : 'No activity recorded here yet. New deposits and withdrawals will appear here.');
    $('activity-state').classList.toggle('journal-warning', !locked && visible && !!warning);
    if (locked || !visible) return;
    for (const record of records) {
      const asset = ASSETS.find(a => a.symbol === record.asset);
      const row = node('li', undefined, 'journal-row');
      row.dataset.activityId = record.id;
      const identity = node('div', undefined, 'journal-identity');
      identity.append(node('span', record.type === 'deposit' ? 'â†˜' : 'â†—', 'journal-icon'));
      const info = node('div');
      info.append(node('h3', `${record.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Â· ${record.asset}`));
      const time = node('time', new Date(record.createdAt).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}));
      time.dateTime = new Date(record.createdAt).toISOString();
      info.append(time);
      identity.append(info);
      const amount = node('div', undefined, 'journal-amount');
      amount.append(node('strong', `${formatUnits(BigInt(record.amount), asset.decimals)} ${asset.symbol}`));
      amount.append(node('small', record.status === 'finalized' ? 'Amount debited' : 'Requested amount'));
      if (record.type === 'withdraw' && record.netAmount !== undefined) amount.append(node('small', `${record.status === 'finalized' ? 'Recipient received' : 'Expected recipient amount'}: ${formatUnits(BigInt(record.netAmount), asset.decimals)} ${asset.symbol}`));
      if (record.type === 'withdraw' && record.fee !== undefined) amount.append(node('small', `Quoted protocol fee: ${formatUnits(BigInt(record.fee), asset.decimals)} ${asset.symbol}`));
      const result = node('div', undefined, 'journal-result');
      const status = node('span', activityStatusLabel(record.status), 'journal-badge');
      status.dataset.status = record.status;
      result.append(status);
      if (['preparing', 'submission-unknown', 'not-found', 'unverified', 'proof-mismatch'].includes(record.status)) result.append(node('small', 'Check balances and onchain activity before retrying.'));
      const actions = node('div', undefined, 'journal-row-actions');
      if (record.signature) {
        const refresh = node('button', 'Refresh status', 'text-link');
        refresh.type = 'button';
        refresh.dataset.activityRefresh = record.id;
        refresh.dataset.action = '';
        refresh.disabled = busy;
        refresh.setAttribute('aria-label', `Refresh ${record.type} status from ${new Date(record.createdAt).toLocaleString()}`);
        const link = node('a', 'Explorer â†—', 'text-link');
        link.href = 'https://explorer.solana.com/tx/' + record.signature;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.referrerPolicy = 'no-referrer';
        actions.append(refresh, link);
      }
      row.append(identity, amount, result, actions);
      list.append(row);
    }
  }
  $('activity-toggle').addEventListener('click', () => {
    visible = !visible;
    $('activity-clear-confirm').hidden = true;
    render();
  });
  $('activity-clear').addEventListener('click', () => { if (!locked && !busy) $('activity-clear-confirm').hidden = false; });
  $('activity-clear-no').addEventListener('click', () => { $('activity-clear-confirm').hidden = true; });
  return {
    unlock(value, error = '') { locked = false; visible = true; records = value; warning = error; render(); },
    update(value) { records = value; warning = ''; render(); },
    warn(text) { warning = text; render(); },
    lock() { locked = true; visible = true; records = []; warning = ''; $('activity-clear-confirm').hidden = true; render(); },
    setBusy(value) { busy = value; },
  };
}
