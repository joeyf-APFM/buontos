import React from 'react';
import type { OntologyConcept } from '@/types/ontology';
import { KnowledgeGraph } from '@/components/semantic-models/knowledge-graph';
import classes from './graph-tab.module.css';

interface GraphTabProps {
  concepts: OntologyConcept[];
  relationships?: OntologyConcept[];
  hiddenRoots: Set<string>;
  onToggleRoot: (rootIri: string) => void;
  onNodeClick: (concept: OntologyConcept) => void;
  showRootBadges?: boolean;
  selectedLanguage?: string;
}

export const GraphTab: React.FC<GraphTabProps> = ({
  concepts,
  relationships,
  hiddenRoots,
  onToggleRoot,
  onNodeClick,
  showRootBadges = true,
  selectedLanguage = 'en',
}) => {
  return (
    <div className={classes.tab}>
      {/* Graph */}
      <div className={classes.graph}>
        <KnowledgeGraph
          concepts={concepts}
          relationships={relationships}
          hiddenRoots={hiddenRoots}
          onToggleRoot={onToggleRoot}
          onNodeClick={onNodeClick}
          showRootBadges={showRootBadges}
          selectedLanguage={selectedLanguage}
        />
      </div>
    </div>
  );
};
