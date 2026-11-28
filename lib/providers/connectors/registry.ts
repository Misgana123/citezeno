import { googleCalendarConnector } from '../google-calendar';
import { githubConnector } from '../github';
import { googleConnector } from '../google-workspace';
import { linearConnector } from '../linear';
import { microsoftConnector } from '../microsoft';
import { notionConnector } from '../notion';
import { slackConnector } from '../slack';
import { todoistConnector } from '../todoist';
import { zoteroConnector } from '../zotero';
import type { ConnectorDefinition } from './types';

/* Every app a user can connect. To add one: write its adapter in
   lib/providers/<name>/ (a ConnectorDefinition giving some of the capabilities
   in ./types), and list it here. The Connections page, the routes and the
   assistant's tools pick it up from the registry; no feature code changes. */
export const CONNECTORS: Readonly<Record<string, ConnectorDefinition>> = {
  [googleConnector.name]: googleConnector,
  [googleCalendarConnector.name]: googleCalendarConnector,
  [microsoftConnector.name]: microsoftConnector,
  [notionConnector.name]: notionConnector,
  [zoteroConnector.name]: zoteroConnector,
  [githubConnector.name]: githubConnector,
  [slackConnector.name]: slackConnector,
  [todoistConnector.name]: todoistConnector,
  [linearConnector.name]: linearConnector,
};

export const CONNECTOR_NAMES = Object.keys(CONNECTORS);
