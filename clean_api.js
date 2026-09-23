const fs = require('fs');
let lines = fs.readFileSync('frontend/src/services/api.ts', 'utf-8').split('\n');

const outLines = [];
let i = 0;

while (i < lines.length) {
    const line = lines[i];

    if (line.includes('import {') && line.includes('./mockFallback')) {
        // Skip import lines
        let j = i;
        while (j < lines.length && !lines[j].includes('} from \'./mockFallback\';')) {
            j++;
        }
        i = j + 1;
        continue;
    }

    if (line.includes('if (forceDemoMode) {')) {
        // Skip the if block
        let openBraces = 1;
        i++;
        while (i < lines.length && openBraces > 0) {
            if (lines[i].includes('{')) openBraces++;
            if (lines[i].includes('}')) openBraces--;
            i++;
        }
        continue;
    }

    if (line.includes('catch {')) {
        outLines.push(line.replace('catch {', 'catch (e) { throw e; }'));
        let openBraces = 1;
        i++;
        while (i < lines.length && openBraces > 0) {
            if (lines[i].includes('{')) openBraces++;
            if (lines[i].includes('}')) openBraces--;
            i++;
        }
        continue;
    }

    outLines.push(line);
    i++;
}

fs.writeFileSync('frontend/src/services/api.ts', outLines.join('\n'), 'utf-8');
console.log('Done cleaning api.ts');
