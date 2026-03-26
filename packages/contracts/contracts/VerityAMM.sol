// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./VerityMarket.sol";

/**
 * @title VerityAMM
 * @dev A simple Fixed Product Market Maker for VerityMarket shares.
 * Uses a simplified version of the Gnosis FPMM.
 */
contract VerityAMM is ERC1155Holder, ReentrancyGuard {
    VerityMarket public market;
    IERC20 public collateralToken;

    uint256 public constant NO_ID = 0;
    uint256 public constant YES_ID = 1;

    event LiquidityAdded(address indexed provider, uint256 amount);
    event SharesBought(address indexed buyer, uint256 outcomeIndex, uint256 collateralSpent, uint256 sharesReceived);
    event SharesSold(address indexed seller, uint256 outcomeIndex, uint256 collateralReceived, uint256 sharesSold);

    constructor(address _market, address _collateralToken) {
        market = VerityMarket(_market);
        collateralToken = IERC20(_collateralToken);
    }

    /**
     * @dev Add liquidity by providing equal amounts of YES and NO shares.
     * This is the same as providing collateral, which the AMM splits.
     */
    function addLiquidity(uint256 amount) external nonReentrant {
        require(collateralToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // Approve market to spend collateral
        collateralToken.approve(address(market), amount);
        
        // Split collateral into YES and NO shares
        market.mintShares(amount);
        
        // Now this contract holds 'amount' YES and 'amount' NO
        emit LiquidityAdded(msg.sender, amount);
    }

    /**
     * @dev Buy shares of a specific outcome using collateral.
     * @param outcomeIndex 0 for NO, 1 for YES.
     * @param collateralAmount Amount of collateral to spend.
     * @param minShares Minimum shares to receive (slippage protection).
     */
    function buy(uint256 outcomeIndex, uint256 collateralAmount, uint256 minShares) external nonReentrant {
        require(outcomeIndex <= 1, "Invalid outcome");
        require(collateralAmount > 0, "Amount must be > 0");

        uint256 yesReserves = market.balanceOf(address(this), YES_ID);
        uint256 noReserves = market.balanceOf(address(this), NO_ID);

        // 1. Transfer collateral from user
        require(collateralToken.transferFrom(msg.sender, address(this), collateralAmount), "Transfer failed");

        // 2. Split collateral into YES and NO
        collateralToken.approve(address(market), collateralAmount);
        market.mintShares(collateralAmount);

        // 3. Swap the "other" share for the "desired" share
        // IMPORTANT: We must use the 18-decimal share amount for the swap math
        uint256 shareAmountFromSplit = collateralAmount * 10**12;
        uint256 sharesToReturn;

        if (outcomeIndex == YES_ID) {
            uint256 swapOut = yesReserves - (noReserves * yesReserves) / (noReserves + shareAmountFromSplit);
            sharesToReturn = shareAmountFromSplit + swapOut;
        } else {
            uint256 swapOut = noReserves - (noReserves * yesReserves) / (yesReserves + shareAmountFromSplit);
            sharesToReturn = shareAmountFromSplit + swapOut;
        }

        require(sharesToReturn >= minShares, "Slippage too high");
        market.safeTransferFrom(address(this), msg.sender, outcomeIndex, sharesToReturn, "");

        emit SharesBought(msg.sender, outcomeIndex, collateralAmount, sharesToReturn);
    }

    /**
     * @dev Sell shares of a specific outcome for collateral.
     * @param outcomeIndex 0 for NO, 1 for YES.
     * @param shareAmount Amount of shares to sell (18 decimals).
     * @param minCollateral Minimum collateral to receive (6 decimals).
     */
    function sell(uint256 outcomeIndex, uint256 shareAmount, uint256 minCollateral) external nonReentrant {
        require(outcomeIndex <= 1, "Invalid outcome");
        require(shareAmount > 0, "Amount must be > 0");

        uint256 yesReserves = market.balanceOf(address(this), YES_ID);
        uint256 noReserves = market.balanceOf(address(this), NO_ID);

        // 1. Transfer shares from user to AMM
        market.safeTransferFrom(msg.sender, address(this), outcomeIndex, shareAmount, "");

        // 2. Calculate share amount to return from pool (swap)
        uint256 swapOut;
        if (outcomeIndex == YES_ID) {
            swapOut = noReserves - (yesReserves * noReserves) / (yesReserves + shareAmount);
        } else {
            swapOut = yesReserves - (yesReserves * noReserves) / (noReserves + shareAmount);
        }

        // 3. Merge the "paired" shares back into collateral (6 decimals)
        uint256 collateralToReturn = swapOut / 10**12;
        require(collateralToReturn >= minCollateral, "Slippage too high");
        
        market.mergeShares(swapOut);

        // 4. Send collateral to user
        require(collateralToken.transfer(msg.sender, collateralToReturn), "Transfer failed");

        emit SharesSold(msg.sender, outcomeIndex, collateralToReturn, shareAmount);
    }
}
