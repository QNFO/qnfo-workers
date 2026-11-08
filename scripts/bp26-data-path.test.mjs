import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.stdout.write(execFileSync('python',[fileURLToPath(new URL('./bp26_data_path_test.py',import.meta.url))],{encoding:'utf8'}));
