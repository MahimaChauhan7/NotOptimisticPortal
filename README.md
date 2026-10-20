# NotOptimisticPortal

Foundry project for the `NotOptimisticPortal` Solidity contract.

## Setup

Install the pinned Solidity dependencies and build:

```sh
npm install
forge build
```

Run the tests with:

```sh
forge test
```

## Deployment

Provide `PORTAL_NAME`, `PORTAL_SYMBOL`, `INITIAL_RLP_BLOCK_HEADER` (hex-encoded RLP bytes), and `GOVERNANCE_ADDRESS` in the environment or a local `.env` file. Configure an RPC endpoint and a Foundry keystore account, then run:

```sh
forge script script/Counter.s.sol:NotOptimisticPortalScript --rpc-url "$RPC_URL" --account <account> --broadcast
```

Keep private keys out of source control. Foundry loads `.env` values for `vm.env*` calls; `.env` files are ignored by git.

## Ethernaut challenge script

[`script/challenge.js`](script/challenge.js) is a browser-side helper for the
`NotOptimisticPortal` Ethernaut challenge. It is configured for this portal and
helper deployment:

```text
Portal: 0x6e146aEc27795CC9a5E60fB4e10eD0A553C37bE6
Helper: 0x0Ae491cBEf917f946ae12BED364b27376D8a5793
```

The script must be run with the wallet that created the Ethernaut instance and
with that wallet connected to the network containing both contracts. It does
not read or store a private key; it uses the wallet provider exposed as
`window.ethereum`.

### What the script demonstrates

`_computeMessageSlot` iterates only up to `messageReceivers.length - 1`. For a
two-operation message, the resulting withdrawal hash commits to operation zero
but not operation one. The script uses that behavior together with the function
selector collision in the challenge:

```text
onMessageReceived(bytes)
transferOwnership_____610165642(address)
```

Both signatures use selector `0x3a69197e`. The constructed transaction follows
this sequence:

1. Operation zero makes the portal call itself with the colliding selector and
   sets the deployed helper as portal owner.
2. The uncommitted final operation calls `onMessageReceived(bytes)` on the
   helper.
3. The helper makes itself the sequencer and submits a simulated L2 block header
   containing the state root constructed by the script.
4. `executeMessage` verifies the matching state and storage proofs and mints one
   portal token to the connected wallet.

This repository is an Ethernaut exercise. Do not reuse the script against
contracts or accounts you are not authorized to test.

### Running it

The file is designed to run as a Chrome DevTools Snippet:

1. Open the Ethernaut challenge page and connect the correct wallet/network.
2. Open Chrome DevTools, select **Sources**, then **Snippets**.
3. Create a new snippet and paste the contents of `script/challenge.js`.
4. Run the snippet.
5. Approve the wallet connection request if one appears.

The script checks that both configured addresses contain contract bytecode,
reads the current portal state, generates the RLP/Merkle proof data, and uses
`callStatic.executeMessage` to simulate the complete transaction. It does not
broadcast during this preparation stage.

A successful preparation prints:

```text
Challenge transaction prepared and simulated successfully.
To broadcast explicitly, run: await submitChallenge()
```

Only after the simulation succeeds, run this in the same DevTools console:

```js
await submitChallenge()
```

This asks the wallet to sign and broadcast `executeMessage`, waits for the
receipt, and prints the resulting portal-token balance. After the balance is
greater than zero, return to Ethernaut and click **Submit Instance**.

If the page is refreshed, all prepared browser variables are cleared; rerun the
snippet. If the script reports that portal state changed, rerun it to regenerate
the header and proofs from the latest state before submitting.
