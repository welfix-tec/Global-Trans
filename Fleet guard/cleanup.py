import re

# Read the entire file
with open(r'd:\3RAG\Project\Fleet guard\js\app.js', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Find the position of the corrupted data start
# It starts with `;4QUM` which is clearly not JavaScript
corruption_start = content.find(';4QUM')

if corruption_start > 0:
    # Find the next valid JavaScript token after the corruption
    # Look for the next 'return' keyword or 'function' keyword
    search_from = corruption_start
    
    # Find next return statement
    next_return = content.find('return', search_from)
    next_function = content.find('function', search_from)
    
    # Use whichever comes first
    next_valid_token = -1
    if next_return > 0:
        next_valid_token = next_return
    if next_function > 0 and (next_valid_token < 0 or next_function < next_valid_token):
        next_valid_token = next_function
    
    if next_valid_token > 0:
        # Remove everything between corruption start and the valid token
        # Keep the semicolon before the corruption
        clean_content = content[:corruption_start] + '\n            ' + content[next_valid_token:]
        
        # Backup original
        with open(r'd:\3RAG\Project\Fleet guard\js\app.js.backup', 'w', encoding='utf-8') as f:
            f.write(content)
        
        # Write cleaned content
        with open(r'd:\3RAG\Project\Fleet guard\js\app.js', 'w', encoding='utf-8') as f:
            f.write(clean_content)
        
        print(f'✓ Successfully cleaned app.js')
        print(f'  - Removed {next_valid_token - corruption_start} bytes of corrupted data')
        print(f'  - Backup saved to: app.js.backup')
        print(f'  - File cleaned and saved')
    else:
        print('✗ Could not find valid code after corruption')
else:
    print('✗ Could not find corruption marker')
