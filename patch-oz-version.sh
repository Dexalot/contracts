#!/bin/bash

# 1. Target Directories Array
TARGET_DIRS=(
    "./lib/openzeppelin-upgradeable-v5/contracts"
    "./lib/teleporter/contracts"
    "./lib/teleporter/contracts"
)

# 2. Patch Arrays
# NOTE: The @ symbols are escaped (\@) for Perl compatibility.
OLD_IMPORTS=(
    "\@openzeppelin/contracts/"
    "\@openzeppelin/contracts\@5.0.2/"
    "\@openzeppelin/contracts-upgradeable\@5.0.2/"
)

NEW_ALIASES=(
    "\@openzeppelin-v5/"
    "\@openzeppelin/contracts-5.0.2/"
    "\@openzeppelin/contracts-upgradeable-5.0.2/"
)

# --- Patching Logic ---

echo "Patching OpenZeppelin V5 Contracts with Perl..."

# Loop through the patch indices
for i in "${!OLD_IMPORTS[@]}"; do

    # Assign the current patch data to temporary variables
    OZ_V5_UPGRADEABLE_DIR="${TARGET_DIRS[$i]}"
    OLD_IMPORT="${OLD_IMPORTS[$i]}"
    NEW_ALIAS="${NEW_ALIASES[$i]}"

    # Execute the core find | xargs | perl command
    # This business logic is identical to the prior script's core command.
    find "$OZ_V5_UPGRADEABLE_DIR" -type f -name "*.sol" -print0 | xargs -0 perl -pi -e "s|${OLD_IMPORT}|${NEW_ALIAS}|g"

done

echo "Patching complete."
