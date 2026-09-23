pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Fixed depth 4: membership in an issuer-approved batch of 16 credentials.
// Public: requestTag (output), root, threshold, audience, nonce.
// Private: holder secret, completed count, membership path and position.
template Reputation() {
    signal input secret;
    signal input completed;
    signal input siblings[4];
    signal input directions[4];
    signal input root;
    signal input threshold;
    signal input audience;
    signal input nonce;
    signal output requestTag;

    component countBits = Num2Bits(16);
    component thresholdBits = Num2Bits(16);
    countBits.in <== completed;
    thresholdBits.in <== threshold;
    component eligible = GreaterEqThan(16);
    eligible.in[0] <== completed;
    eligible.in[1] <== threshold;
    eligible.out === 1;

    component holder = Poseidon(1);
    holder.inputs[0] <== secret;
    component leaf = Poseidon(2);
    leaf.inputs[0] <== holder.out;
    leaf.inputs[1] <== completed;

    signal nodes[5];
    signal left[4];
    signal right[4];
    component branch[4];
    nodes[0] <== leaf.out;
    for (var i = 0; i < 4; i++) {
        directions[i] * (directions[i] - 1) === 0;
        left[i] <== nodes[i] + directions[i] * (siblings[i] - nodes[i]);
        right[i] <== siblings[i] + directions[i] * (nodes[i] - siblings[i]);
        branch[i] = Poseidon(2);
        branch[i].inputs[0] <== left[i];
        branch[i].inputs[1] <== right[i];
        nodes[i+1] <== branch[i].out;
    }
    nodes[4] === root;

    component tag = Poseidon(3);
    tag.inputs[0] <== secret;
    tag.inputs[1] <== audience;
    tag.inputs[2] <== nonce;
    requestTag <== tag.out;
}

component main {public [root, threshold, audience, nonce]} = Reputation();
