#!/usr/bin/env python3
"""Script to remove corrupted EXIF/XMP data from app.js"""

import os
import shutil

app_js_path = r'd:\3RAG\Project\Fleet guard\js\app.js'

print("Reading file...")
# Read the file with error handling for corrupt data
with open(app_js_path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

print(f"File size: {len(content):,} characters")

# Find the corruption marker
print("Searching for corruption marker ';4QUM'...")
corruption_start = content.find(';4QUM')
if corruption_start == -1:
    print("ERROR: Corruption marker ';4QUM' not found")
    exit(1)

print(f"  Found at position: {corruption_start:,}")

# Find where valid code resumes
print("Searching for valid code marker 'function generateJobCardReport(jc) {'...")
valid_code_start = content.find('function generateJobCardReport(jc) {', corruption_start)
if valid_code_start == -1:
    print("ERROR: Valid code marker not found after corruption")
    exit(1)

print(f"  Found at position: {valid_code_start:,}")

# Calculate corruption size
corruption_size = valid_code_start - corruption_start
print(f"Corruption size: {corruption_size:,} characters")

# Find the template literal closing before corruption
print("Finding template literal closing '`; before corruption...")
before_corruption = content[:corruption_start]
# Look for the pattern `};  which closes the template literal
last_template_close = before_corruption.rfind('`};')
if last_template_close == -1:
    # Try just ` ;
    last_template_close = before_corruption.rfind('`;')
    if last_template_close == -1:
        print("ERROR: Template literal closing not found")
        exit(1)
    keep_until = last_template_close + 2
else:
    keep_until = last_template_close + 3

print(f"  Template literal closes at position: {keep_until:,}")

# Build cleaned content
print("Building cleaned content...")
cleaned_content = before_corruption[:keep_until]

# Add newline and the valid function
cleaned_content += '\n            }\n            '
cleaned_content += content[valid_code_start:]

# Create backup
backup_path = app_js_path + '.backup'
print(f"Creating backup: {backup_path}")
if os.path.exists(backup_path):
    os.remove(backup_path)
shutil.copy2(app_js_path, backup_path)
print(f"  ✓ Backup created")

# Write cleaned file
print(f"Writing cleaned file: {app_js_path}")
with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(cleaned_content)
print(f"  ✓ File written ({len(cleaned_content):,} characters)")

print("\n✓ COMPLETE - File cleaned successfully!")
print(f"  Removed {corruption_size:,} characters of corrupted data")
print(f"  New file size: {len(cleaned_content):,} characters")
print(f"  Backup saved: {backup_path}")
