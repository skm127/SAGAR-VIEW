import sys

with open('frontend/src/services/api.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

out = []
i = 0
while i < len(lines):
    line = lines[i]
    if 'import {' in line and './mockFallback' in line:
        i += 1
        continue
    if 'if (forceDemoMode) {' in line:
        # skip this and next 3 lines assuming block is:
        # if (forceDemoMode) {
        #   notifyFallback();
        #   return ...
        # }
        while '}' not in lines[i]:
            i += 1
        i += 1
        continue
    
    if '} catch {' in line:
        out.append('  } catch (e) { throw e; }\n')
        # skip lines until the closing brace of the catch block
        i += 1
        while '}' not in lines[i]:
            i += 1
        i += 1
        continue
        
    out.append(line)

with open('frontend/src/services/api.ts', 'w', encoding='utf-8') as f:
    f.writelines(out)
