#!/bin/bash
# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

python3 -m venv .env
source .env/bin/activate
python3 -m pip install --upgrade pip setuptools
python3 -m pip install -r requirements.txt
MODE="$1"
shift

if [ "$MODE" = "vars" ]; then
    python3 generate_vars.py "$@"
elif [ "$MODE" = "svgs" ]; then
    python3 generate_svgs.py "$@"
else
    echo "Unknown mode: $MODE"
    exit 1
fi
