import { CALENDAR_TOOLS } from './calendar';
import { FILE_TOOLS } from './files';
import { MAIL_TOOLS } from './mail';
import { MESSAGE_TOOLS } from './messages';
import { REPO_TOOLS } from './repos';
import { TASK_TOOLS } from './tasks';
import { NOTES_TOOLS } from './notes';
import { OFFICE_TOOLS } from './office';
import { REFERENCE_TOOLS } from './references';

/* Tools for the user's connected apps, one module per capability. Each says
   which capability it needs, and is offered only while an app giving it is connected. */
export const CONNECTOR_TOOLS = [...FILE_TOOLS, ...OFFICE_TOOLS, ...NOTES_TOOLS, ...REFERENCE_TOOLS, ...MAIL_TOOLS, ...CALENDAR_TOOLS, ...REPO_TOOLS, ...MESSAGE_TOOLS, ...TASK_TOOLS];
