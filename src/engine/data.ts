// The dataset, bundled at build time from data/*.json. The browser, the tests
// and the agent all import the same objects, so there is one code path and no
// network fetch at startup.
import config from '../../data/config.json';
import teams from '../../data/teams.json';
import chipsets from '../../data/chipsets.json';
import models from '../../data/models.json';
import submissions from '../../data/submissions.json';
import tickets from '../../data/tickets.json';
import parts from '../../data/parts.json';
import bom from '../../data/bom.json';
import warehouses from '../../data/warehouses.json';
import stock from '../../data/stock.json';
import suppliers from '../../data/suppliers.json';
import deliveries from '../../data/deliveries.json';
import substitutes from '../../data/substitutes.json';
import testSuites from '../../data/testSuites.json';
import testRuns from '../../data/testRuns.json';
import type { Dataset } from './types';

const DATASET = {
  config, teams, chipsets, models, submissions, tickets, parts, bom,
  warehouses, stock, suppliers, deliveries, substitutes, testSuites, testRuns,
} as unknown as Dataset;

/** A fresh deep copy of the dataset; callers may change it freely. */
export const loadData = (): Dataset => structuredClone(DATASET);
