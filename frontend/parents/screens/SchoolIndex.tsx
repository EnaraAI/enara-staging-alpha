import React from 'react';
import type { LearnerChip, SchoolOverview } from '../api';
import { useP } from '../ui';
import type { SchoolView } from './School';
import { SchoolTiles, TodayClasses } from './Today';

// Design A: the School tab. Today's classes first, then one row per section the school has on; each row opens that section.
export const SchoolIndex: React.FC<{ learner: LearnerChip; overview: SchoolOverview; open: (v: SchoolView) => void }> = ({ learner, overview, open }) => {
  const { t } = useP();
  return (
    <div className="pp-schoolindex" data-testid="pp-school-index">
      <div className="pp-pagehead">
        <div><h1 className="pp-h1" style={{ margin: 0 }}>{t.tabs.school}</h1><p className="pp-sub">{learner.school ?? t.ui.schoolSub}</p></div>
      </div>
      <TodayClasses overview={overview} open={open} />
      <SchoolTiles overview={overview} open={open} />
    </div>
  );
};
