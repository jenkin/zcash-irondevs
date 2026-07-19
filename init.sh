#!/bin/bash

SOURCE="https://codez.ombie.cash"
REPOSITORIES="$SOURCE/assets/data/repositories.dat"
SAMPLE_SIZE=5

while IFS= read -r REPO; do
  [[ -z "$REPO" ]] && continue

  SOURCE="https://github.com/$REPO.git"
  TARGET="./data/$REPO.git"

  if [ ! -d $TARGET ]; then
    echo "Cloning $SOURCE in $TARGET..."
    git clone --bare $SOURCE $TARGET
  else
    echo "Target $TARGET already exists, skip."
  fi
done < <(curl -sfL $REPOSITORIES | shuf -n $SAMPLE_SIZE)
