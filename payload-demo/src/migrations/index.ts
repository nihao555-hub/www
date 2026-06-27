import * as migration_20260627_084020_initial from './20260627_084020_initial';

export const migrations = [
  {
    up: migration_20260627_084020_initial.up,
    down: migration_20260627_084020_initial.down,
    name: '20260627_084020_initial'
  },
];
