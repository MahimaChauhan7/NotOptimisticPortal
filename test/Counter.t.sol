// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {NotOptimisticPortal} from "../src/Counter.sol";

/// @dev Test-only harness that exposes the internal message-slot calculation.
contract PortalHarness is NotOptimisticPortal {
    constructor(
        string memory name_,
        string memory symbol_,
        bytes memory initialHeader_,
        address governance_
    ) NotOptimisticPortal(name_, symbol_, initialHeader_, governance_) {}

    function computeMessageSlot(
        address tokenReceiver,
        uint256 amount,
        address[] calldata messageReceivers,
        bytes[] calldata messageData,
        uint256 salt
    ) external pure returns (bytes32) {
        return _computeMessageSlot(tokenReceiver, amount, messageReceivers, messageData, salt);
    }
}

contract NotOptimisticPortalTest is Test {
    PortalHarness public portal;
    address public governance;

    function setUp() public {
        governance = makeAddr("governance");
        portal = new PortalHarness("Not Optimistic", "NOP", _initialHeader(), governance);
    }

    function test_ConstructorInitializesPortalState() public view {
        assertEq(portal.owner(), address(this));
        assertEq(portal.governance(), governance);
        assertEq(portal.latestBlockNumber(), 1);
        assertEq(portal.latestBlockTimestamp(), 1);
        assertEq(portal.bufferCounter(), 1);
    }

    function test_LastMessageCallIsNotBoundToMessageHash() public {
        address tokenReceiver = makeAddr("alice");
        address committedReceiver = makeAddr("rewards");
        address originalFinalReceiver = makeAddr("bob");
        address substitutedFinalReceiver = makeAddr("lili");

        address[] memory originalReceivers = new address[](2);
        originalReceivers[0] = committedReceiver;
        originalReceivers[1] = originalFinalReceiver;
        bytes[] memory originalData = new bytes[](2);
        originalData[0] = abi.encodeWithSelector(bytes4(0x3a69197e), bytes("rewards"));
        originalData[1] = abi.encodeWithSelector(bytes4(0x3a69197e), bytes("bob"));

        address[] memory substitutedReceivers = new address[](2);
        substitutedReceivers[0] = committedReceiver;
        substitutedReceivers[1] = substitutedFinalReceiver;
        bytes[] memory substitutedData = new bytes[](2);
        substitutedData[0] = originalData[0];
        substitutedData[1] = abi.encodeWithSelector(bytes4(0x3a69197e), bytes("lili"));

        bytes32 originalHash = portal.computeMessageSlot(
            tokenReceiver, 100 ether, originalReceivers, originalData, 42
        );
        bytes32 substitutedHash = portal.computeMessageSlot(
            tokenReceiver, 100 ether, substitutedReceivers, substitutedData, 42
        );

        // The last target and its calldata differ, but the current implementation
        // produces the same proof key for both messages.
        assertEq(originalHash, substitutedHash);
    }

    function test_SingleMessageCallIsNotBoundToMessageHash() public {
        address[] memory bobReceiver = new address[](1);
        bobReceiver[0] = makeAddr("bob");
        bytes[] memory bobData = new bytes[](1);
        bobData[0] = abi.encodeWithSelector(bytes4(0x3a69197e), bytes("bob"));

        address[] memory liliReceiver = new address[](1);
        liliReceiver[0] = makeAddr("lili");
        bytes[] memory liliData = new bytes[](1);
        liliData[0] = abi.encodeWithSelector(bytes4(0x3a69197e), bytes("lili"));

        assertEq(
            portal.computeMessageSlot(makeAddr("alice"), 100 ether, bobReceiver, bobData, 42),
            portal.computeMessageSlot(makeAddr("alice"), 100 ether, liliReceiver, liliData, 42)
        );
    }

    function _initialHeader() private pure returns (bytes memory) {
        return abi.encodePacked(
            hex"eca0",
            bytes32(0),
            hex"8080a0",
            bytes32(uint256(2)),
            hex"8080808001808001"
        );
    }
}
