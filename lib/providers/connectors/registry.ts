import { googleConnector } from '../google-workspace';
import { notionConnector } from '../notion';
import { zoteroConnector } from '../zotero';
import type { ConnectorDefinition } from './types';

/* Every app a user can connect. To add one: write its adapter in
   lib/providers/<name>/ (a ConnectorDefinition giving some of the capabilities
   in ./types), and list it here. The Connections page, the routes and the
   assistant's tools pick it up from the registry; no feature code changes. */
export const CONNECTORS: Readonly<Record<string, ConnectorDefinition>> = {
  [googleConnector.name]: googleConnector,
  [notionConnector.name]: notionConnector,
  [zoteroConnector.name]: zoteroConnector,
};

export const CONNECTOR_NAMES = Object.keys(CONNECTORS);
