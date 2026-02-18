import sys

# --- CONFIGURATION ---
# PASTE YOUR 3 ADDRESSES HERE (Remove the '0x')
validator_1 = "0x1bB3c72918a315d67fac7641e8bf0906577ca263"
validator_2 = "0x92173f5df8050332Fee023628835F72e8d4Be471"
validator_3 = "0x60Ecd1C3590f3BE4BB18D302537c4989A11735E9"
# ---------------------

def create_clique_extradata(validators):
    # 1. 32 bytes of vanity (zeros)
    prefix = "0" * 64
    
    # 2. Concatenate validator addresses
    # Ensure they are stripped of '0x' and lowercase
    validators_hex = "".join([v.replace("0x", "").lower() for v in validators])
    
    # 3. 65 bytes of signature suffix (zeros)
    suffix = "0" * 130
    
    return "0x" + prefix + validators_hex + suffix

validators = [validator_1, validator_2, validator_3]
print("\nYOUR EXTRA_DATA STRING:")
print(create_clique_extradata(validators))
print("\n")