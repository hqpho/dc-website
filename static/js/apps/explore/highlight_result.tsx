import React, { ReactElement, useEffect, useMemo, useState } from "react";

import { SubjectPageMainPane } from "../../components/subject_page/main_pane";
import { NamedNode, StatVarFacetMap } from "../../shared/types";
import { buildCitationParts } from "../../tools/shared/metadata/citations";
import { StatVarMetadata } from "../../tools/shared/metadata/metadata";
import { fetchMetadata } from "../../tools/shared/metadata/metadata_fetcher";
import { FacetMetadata } from "../../types/facet_metadata";
import { SubjectPageMetadata } from "../../types/subject_page_types";
import { getDataCommonsClient } from "../../utils/data_commons_client";
import { FacetResponse, getFacets } from "../../utils/data_fetch_utils";
import { trimCategory } from "../../utils/subject_page_utils";

/**
 * Component to show the Subject Page for the highlight only.
 */

const PAGE_ID = "highlight-result";

interface HighlightResultProps {
  highlightPageMetadata: SubjectPageMetadata;
  maxBlock: number;
  highlightFacet?: FacetMetadata;
  apiRoot?: string;
}

async function doMetadataFetch(props: HighlightResultProps): Promise<{
  metadata: Record<string, StatVarMetadata[]>;
  statVarList: NamedNode[];
}> {
  // Fetch the requested stat vars.
  const statVarSet = new Set<string>();
  for (const category of props.highlightPageMetadata.pageConfig.categories) {
    if (category.statVarSpec) {
      for (const spec of Object.values(category.statVarSpec)) {
        statVarSet.add(spec.statVar);
        if (spec.denom) {
          statVarSet.add(spec.denom);
        }
      }
    }
  }

  const dataCommonsClient = getDataCommonsClient(props.apiRoot);

  const facets: FacetResponse = await getFacets(
    props.apiRoot,
    [props.highlightPageMetadata.place.dcid],
    Array.from(statVarSet)
  );

  const statVarFacetMap: StatVarFacetMap = {};
  for (const statVar in facets) {
    const facet = facets[statVar];
    for (const facetId in facet) {
      if (facet[facetId].importName === props.highlightFacet.importName) {
        statVarFacetMap[statVar] = new Set([facetId]);
        break;
      }
    }
  }

  return fetchMetadata(
    statVarSet,
    facets,
    dataCommonsClient,
    statVarFacetMap,
    props.apiRoot
  );
}

function generateCitationSources(
  statVars: NamedNode[],
  metadataMap: Record<string, StatVarMetadata[]>
): string {
  return buildCitationParts(statVars, metadataMap, true)
    .map(({ label }) => label)
    .join(", ");
}

/**
 * Component to render the highlight result section of the page.
 *
 * This component fetches metadata and statistical variable information,
 * processes the page configuration, and renders the main pane with the
 * processed data.
 *
 * @param props - The properties for the HighlightResult component.
 * @param props.highlightPageMetadata - Metadata for the highlight page, including
 * the page configuration and place information.
 * @param props.maxBlock - The maximum number of blocks to display in the trimmed
 * category configuration.
 * @param props.highlightFacet - The facet to highlight in the rendered page.
 *
 * @returns A React element rendering the highlight result section.
 */
export function HighlightResult(props: HighlightResultProps): ReactElement {
  const [metadataMap, setMetadataMap] = useState<
    Record<string, StatVarMetadata[]>
  >({});

  useEffect(() => {
    // Fetch metadata and stat var list when component mounts or props change
    const fetchData = async (): Promise<void> => {
      doMetadataFetch(props).then(({ metadata }) => {
        setMetadataMap(metadata);
      });
    };
    void fetchData();
  }, [props]);

  const pageConfig = useMemo(() => {
    // Process the page config and update the description for each block if we have metadata for it.
    const pageConfigCopy = structuredClone(
      props.highlightPageMetadata.pageConfig
    );

    if (
      pageConfigCopy.categories.length === 0 ||
      pageConfigCopy.categories[0].blocks.length === 0
    ) {
      return pageConfigCopy;
    }

    for (const category of pageConfigCopy.categories) {
      const categoryStatVars: NamedNode[] = category.statVarSpec
        ? Object.values(category.statVarSpec).map((spec) => ({
            dcid: spec.statVar,
            name: spec.statVar,
          }))
        : [];
      const blockCitations = generateCitationSources(
        categoryStatVars,
        metadataMap
      );

      for (const block of category.blocks) {
        block.description = blockCitations;
      }
    }
    return pageConfigCopy;
  }, [metadataMap, props.highlightPageMetadata.pageConfig]);

  return (
    <div className="highlight-result-title">
      <SubjectPageMainPane
        id={PAGE_ID}
        place={props.highlightPageMetadata.place}
        pageConfig={trimCategory(pageConfig, props.maxBlock)}
        showExploreMore={false}
        highlightFacet={props.highlightFacet}
      />
    </div>
  );
}
