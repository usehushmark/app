import {backupMarkup} from './wallet-tools-markup.js';
export const privateActivity = `
<section id="activity-section" class="private-activity" aria-labelledby="activity-heading">
  <div class="journal-heading">
    <div><p class="eyebrow">03 / ONLY ON THIS BROWSER</p><h2 id="activity-heading">Private activity<span>.</span></h2></div>
    <div class="journal-toolbar">
      <button id="activity-toggle" class="secondary-button" aria-controls="activity-list" aria-expanded="false" hidden>Hide history</button>
      <button id="activity-clear" class="text-link" data-action hidden>Clear local history</button>
    </div>
  </div>
  <p class="journal-description">Encrypted on this browser. Only activity initiated here is recorded.</p>
  <p id="activity-state" role="status" aria-live="polite">Unlock your wallet to read its local history.</p>
  <div id="activity-clear-confirm" class="journal-clear-confirm" hidden>
    <h3>Clear this wallet’s local history?</h3>
    <p>This deletes the saved activity list from this browser. Your funds, pool notes and onchain transactions are unchanged. These records cannot be restored here.</p>
    <div class="journal-toolbar"><button id="activity-clear-yes" class="secondary-button" data-action>Clear history</button><button id="activity-clear-no" class="text-link">Keep history</button></div>
  </div>
  <ul id="activity-list" class="journal-list" aria-label="Local deposit and withdrawal history"></ul>
  ${backupMarkup}<p class="journal-footnote">The latest 100 activities are kept here. No history is sent to an analytics backend. Status checks contact your selected RPC; explorer links open a third-party service. <a class="text-link" href="/docs/#activity">About local history ↗</a></p>
</section>`;

export const activityDocs = `<section id="activity"><h2>Your activity, saved locally.</h2><p>Hushmark records new deposit and withdrawal attempts initiated in this browser. The latest 100 records are encrypted in local storage with AES-GCM, using a separate key derived from your verified unlock signature. Unlocking the same wallet on the same browser and site lets you read them again. Locking discards the history key and removes the decrypted list from the page. No additional signature is requested for this feature.</p><p>The records include the asset, amount, protocol fee, time, status and transaction signature when available. Recipient addresses are not saved. Withdrawal records also keep a hash of the approved proof so finality checks can verify the returned transaction after a reload. A submitted signature, a confirmed transaction and a finalized transaction are different states. An interrupted request or missing transaction must not be treated as a safe invitation to retry.</p><p>This is a local activity log, not your complete onchain history or a backup of your funds. It does not scan earlier transactions automatically. Use an encrypted history backup to transfer saved records from another browser or domain with the same wallet. Clearing site data or local history deletes the log; it does not withdraw funds or erase public transactions. Your original software wallet is still needed to recover private notes through the protocol.</p><p>No analytics backend receives this journal, and status checks are not run automatically when history is opened. Refresh status queries your configured Solana RPC. Opening Explorer visits a third-party service. Browser storage exposes the wallet address used to scope the encrypted journal. Encryption protects stored content while locked; it cannot protect against a compromised browser or site while unlocked. Storage failure leaves wallet operations available, but the local history can be incomplete.</p></section>`;
