import { FILE_TOOLS } from './files';
import { NOTES_TOOLS } from './notes';
import { OFFICE_TOOLS } from './office';
import { REFERENCE_TOOLS } from './references';

/* Tools for the user's connected apps, one module per capability. Each says
   which capability it needs, and is offered only while an app giving it is connected. */
export const CONNECTOR_TOOLS = [...FILE_TOOLS, ...OFFICE_TOOLS, ...NOTES_TOOLS, ...REFERENCE_TOOLS];
