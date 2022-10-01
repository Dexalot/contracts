#!/bin/bash

# runner for Dexalot tests

if [ $# -gt 0 ]
  then
    prefix="$1"
  else
    prefix=""
fi

RUNALL=0

for _test in $(ls ./test/Test${prefix}*.ts)
do
    test=$(basename $_test)
    if [ $RUNALL -eq 0 ]
    then
      echo
      read -r -p "Do you wish to run test ${test}? [ Yes (Y) / No (n) / All (a) / Exit (e) ]> " ynaqe
      echo
    fi

    action_time=$(date)

    if [ -z $ynaqe ]
    then
      ynaqe="y"
    fi

    case $ynaqe in
      [Yy]* ) echo "*******"; echo "******* ${action_time} :: running :: ${test}"; echo "*******"; echo; npx hardhat test test/${test};;
      [Nn]* ) echo "*******"; echo "******* ${action_time} :: skipping :: ${test}"; echo "*******";;
      [Aa]* ) RUNALL=1; echo "*******"; echo "******* ${action_time} :: running :: ${test}"; echo "*******"; echo; npx hardhat test test/${test};;
      [QqEe]* ) echo "*******"; echo "******* ${action_time} :: exiting";  echo "*******"; echo; exit 0;;
      * ) echo "*******"; echo "${action_time} :: invalid response"; echo "*******"; echo;;
    esac

done

exit 0
