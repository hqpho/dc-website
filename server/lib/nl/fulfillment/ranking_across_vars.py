# Copyright 2023 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import logging
from typing import List

from lib.nl import utils
from lib.nl.detection import Place
from lib.nl.fulfillment.base import add_chart_to_utterance
from lib.nl.fulfillment.base import ChartVars
from lib.nl.fulfillment.base import overview_fallback
from lib.nl.fulfillment.base import populate_charts
from lib.nl.fulfillment.base import PopulateState
from lib.nl.utterance import ChartOriginType
from lib.nl.utterance import ChartType
from lib.nl.utterance import Utterance


#
# For ranking across vars, we should have detected a ranking, but not contained-in
# classification in the current utterance.  In the callback, we will also
# check that the SVs are part of a peer group (only those are comparable!).
# For example, [most grown agricultural things], again assuming california
# is in the context.
# TODO: consider checking for common units, especially when we rely on
#       auto-expanded peer groups of SVs.
#
def populate(uttr: Utterance):
  # Get the RANKING classifications from the current utterance. That is what
  # let us infer this is ranking query-type.
  ranking_types = utils.get_ranking_types(uttr)
  if ranking_types:
    # Ranking among stat-vars.
    if populate_charts(
        PopulateState(uttr=uttr,
                      main_cb=_populate_cb,
                      fallback_cb=overview_fallback,
                      ranking_types=ranking_types)):
      return True
    else:
      utils.update_counter(uttr.counters, 'ranking-across-vars_failed_populate',
                           1)

  return False


def _populate_cb(state: PopulateState, chart_vars: ChartVars,
                 places: List[Place], chart_origin: ChartOriginType) -> bool:
  logging.info('populate_cb for ranking_across_vars')
  if not state.ranking_types:
    utils.update_counter(state.uttr.counters,
                         'ranking-across-vars_failed_cb_norankingtypes', 1)
    return False
  if len(places) > 1:
    utils.update_counter(state.uttr.counters,
                         'ranking-across-vars_failed_cb_toomanyplaces',
                         [p.dcid for p in places])
    return False
  if state.place_type:
    utils.update_counter(state.uttr.counters,
                         'ranking-across-vars_failed_cb_hasplacetype',
                         state.place_type.value)
    return False
  if len(chart_vars.svs) < 2:
    utils.update_counter(state.uttr.counters,
                         'ranking-across-vars_failed_cb_toofewvars',
                         chart_vars.svs)
    return False
  if not chart_vars.is_topic_peer_group:
    utils.update_counter(state.uttr.counters,
                         'ranking-across-vars_failed_cb_notpeergroup',
                         chart_vars.svs)
    return False

  # Ranking among peer group of SVs.
  ranked_svs = utils.rank_svs_by_latest_value(places[0].dcid, chart_vars.svs,
                                              state.ranking_types[0])
  utils.update_counter(state.uttr.counters, 'ranking-across-vars_reranked_svs',
                       {
                           'orig': chart_vars.svs,
                           'ranked': ranked_svs,
                       })
  chart_vars.svs = ranked_svs
  # Show per-capita too.
  chart_vars.include_percapita = True
  chart_vars.response_type = "ranked bar chart"
  return add_chart_to_utterance(ChartType.BAR_CHART, state, chart_vars, places,
                                chart_origin)