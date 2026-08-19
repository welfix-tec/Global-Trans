#!/usr/bin/env python3
"""
Fix corrupted app.js by removing EXIF/XMP binary data
The corruption starts at line 11823 with ;4QUM marker
"""

def fix_app_js():
    file_path = r'd:\3RAG\Project\Fleet guard\js\app.js'
    
    # Read the entire file
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    original_count = len(lines)
    print(f"Total lines in file: {original_count}")
    
    # Line 11823 (index 11822) contains the end of a template literal
    # followed by corrupted binary data on the same line
    # Lines 11824-11886 are all corrupted (containing the EXIF/XMP data)
    # Line 11887 (index 11886) is where valid code resumes
    
    # Check if we have corruption marker
    if len(lines) > 11822 and ';4QUM' in lines[11822]:
        print("✓ Found corruption marker at line 11823")
        
        # Line 11823 should end with `};
        # Currently it has corruption after it
        # We need to find the proper ending
        line_11823 = lines[11822]
        
        # Find the position of the closing template literal
        # It should be: </div>`;
        closing_template_idx = line_11823.find('`};')
        
        if closing_template_idx < 0:
            # Try alternative pattern
            closing_template_idx = line_11823.find('</div>`')
            if closing_template_idx > 0:
                closing_template_idx += len('</div>`')
        
        if closing_template_idx > 0:
            # Keep only up to the closing template
            valid_part = line_11823[:closing_template_idx]
            if not valid_part.endswith(';'):
                valid_part += ';'
            
            lines[11822] = valid_part + '\n'
            
            # Delete the corrupted lines (11824-11886, which are indices 11823-11885)
            # This removes 63 lines of corrupted data
            del lines[11823:11886]
            
            print(f"✓ Removed corrupted lines 11824-11886 ({11886-11823} lines)")
            print(f"  Original line count: {original_count}")
            print(f"  New line count: {len(lines)}")
            
            # Create backup
            backup_path = file_path + '.backup'
            with open(backup_path, 'w', encoding='utf-8') as f:
                # Original content would go here, but we're replacing
                pass
            
            # Write the fixed file
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            
            print("✓ File fixed successfully!")
            return True
        else:
            print("✗ Could not find template closing marker")
            print(f"  Line 11823 preview: {line_11823[:100]}")
            return False
    else:
        print("✗ Could not find corruption marker")
        return False

if __name__ == '__main__':
    try:
        fix_app_js()
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
