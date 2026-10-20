// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {NotOptimisticPortal} from "../src/Counter.sol";

contract NotOptimisticPortalScript is Script {
    NotOptimisticPortal public portal;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        portal = new NotOptimisticPortal(
            vm.envString("PORTAL_NAME"),
            vm.envString("PORTAL_SYMBOL"),
            vm.envBytes("INITIAL_RLP_BLOCK_HEADER"),
            vm.envAddress("GOVERNANCE_ADDRESS")
        );

        vm.stopBroadcast();
    }
}
