import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
mkdirSync('reports',{recursive:true});
const result=spawnSync(process.execPath,['--test','--test-reporter=spec','--test-reporter=junit','--test-reporter-destination=stdout','--test-reporter-destination=reports/unit.xml'],{stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
