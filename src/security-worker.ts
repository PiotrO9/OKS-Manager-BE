import 'dotenv/config';
import { startSecurityWorkers } from './services/security-events/worker';

startSecurityWorkers(true);
