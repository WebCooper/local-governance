"""
Blockchain Oracle Module

This module handles cryptographic signing of approved content for blockchain verification.
It provides functions to create Ethereum-compatible digital signatures that can be
verified by smart contracts.

Author: AI Oracle Content Moderation System
"""

import os
import logging
from typing import Dict, Optional
from eth_account import Account
from eth_account.messages import encode_defunct
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
PRIVATE_KEY = os.getenv("ORACLE_PRIVATE_KEY")

# Validate environment setup on module load
if not PRIVATE_KEY:
    logger.error("ORACLE_PRIVATE_KEY not found in environment variables!")
    logger.error("Please ensure .env file exists with a valid private key.")
    logger.error("Use the setup instructions in README.md to generate a key.")


def sign_data(text_content: str) -> Optional[Dict[str, str]]:
    """
    Creates a cryptographic signature for approved content.

    This function signs text content using Ethereum's EIP-191 standard,
    making it verifiable by smart contracts on Ethereum-compatible blockchains.

    Args:
        text_content (str): The text content to sign. Must be exactly the same
                           text that was approved by the moderation system.

    Returns:
        Optional[Dict[str, str]]: Dictionary containing:
            - signature: Hexadecimal signature string (without 0x prefix)
            - address: Oracle's Ethereum address (with 0x prefix)
            Returns None if signing fails due to missing private key.

    Raises:
        ValueError: If text_content is empty or not a string
        Exception: If private key is malformed or signing fails

    Example:
        >>> result = sign_data("Pothole reported on Main Street")
        >>> if result:
        ...     print(f"Signature: {result['signature']}")
        ...     print(f"Oracle: {result['address']}")
    """
    # Input validation
    if not isinstance(text_content, str):
        raise ValueError("text_content must be a string")

    if not text_content.strip():
        raise ValueError("text_content cannot be empty")

    # Check if private key is available
    if not PRIVATE_KEY:
        logger.error("Cannot sign data: No private key configured")
        logger.error("Please set ORACLE_PRIVATE_KEY in your .env file")
        return None

    try:
        # Create standardized Ethereum message format
        # This prevents signature replay attacks and ensures smart contract compatibility
        message = encode_defunct(text=text_content)

        # Load the Oracle account from private key
        account = Account.from_key(PRIVATE_KEY)

        # Generate cryptographic signature
        signed_message = account.sign_message(message)

        logger.info(
            f"Successfully signed content for oracle address: {account.address}"
        )

        return {
            "signature": signed_message.signature.hex(),  # Signature without 0x prefix
            "address": account.address,  # Oracle address with 0x prefix
        }

    except ValueError as e:
        logger.error(f"Invalid private key format: {e}")
        logger.error(
            "Ensure ORACLE_PRIVATE_KEY is a valid 64-character hex string without 0x prefix"
        )
        return None

    except Exception as e:
        logger.error(f"Unexpected error during signing: {e}")
        return None


def get_oracle_address() -> Optional[str]:
    """
    Get the Oracle's Ethereum address without signing anything.

    Useful for displaying the oracle address or verifying configuration
    without performing a signing operation.

    Returns:
        Optional[str]: Oracle's Ethereum address with 0x prefix,
                      or None if private key is not configured.
    """
    if not PRIVATE_KEY:
        logger.error("Cannot get oracle address: No private key configured")
        return None

    try:
        account = Account.from_key(PRIVATE_KEY)
        return account.address

    except ValueError as e:
        logger.error(f"Invalid private key format: {e}")
        return None

    except Exception as e:
        logger.error(f"Unexpected error getting oracle address: {e}")
        return None


def validate_oracle_setup() -> bool:
    """
    Validate that the oracle is properly configured.

    This function checks if the private key is set and valid,
    and returns the oracle's configuration status.

    Returns:
        bool: True if oracle is properly configured, False otherwise.
    """
    if not PRIVATE_KEY:
        logger.error("Oracle setup validation failed: No private key found")
        return False

    try:
        # Test that we can create an account from the key
        account = Account.from_key(PRIVATE_KEY)
        logger.info(f"Oracle setup validation passed. Address: {account.address}")
        return True

    except ValueError as e:
        logger.error(
            f"Oracle setup validation failed: Invalid private key format - {e}"
        )
        return False

    except Exception as e:
        logger.error(f"Oracle setup validation failed: {e}")
        return False
