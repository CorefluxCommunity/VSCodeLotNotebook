# Walkthrough Media Files

This directory contains images and media files for the VS Code walkthrough experience.

## Required Files

The following GIF animations should be created for each walkthrough step:

1. `create-notebook.gif` - Shows creating a new LOT notebook ✅
2. `create-markdown.gif` - Shows creating a Markdown documentation file  
3. `connect-broker.gif` - Shows the broker connection dialog
4. `timer-action.gif` - Shows creating a timer-based action
5. `upload-action.gif` - Shows uploading an action to the broker
6. `create-model.gif` - Shows creating a data model
7. `model-action.gif` - Shows creating an action that uses a model
8. `python-scripts.gif` - Shows creating Python scripts and LOT actions

## Media Requirements

- **Size:** 400px width maximum
- **Format:** GIF with optimized file size
- **Duration:** 3-8 seconds per animation
- **Loop Setting:** **INFINITE LOOP** for auto-replay functionality
- **Content:** Clean animated demonstrations of the relevant VS Code UI interactions
- **Style:** Consistent with VS Code's design language
- **Performance:** Optimize for web display (keep file size under 2MB per GIF)

## GIF Creation Guidelines

To ensure auto-replay in VS Code walkthroughs:

1. **Set Loop Count to 0** (infinite) when exporting/creating your GIFs
2. **Use tools that support loop settings:**
   - **Photoshop:** Timeline → Export → Save for Web → Loop Options → Forever
   - **GIMP:** Filters → Animation → Optimize (for GIF) → Loop forever
   - **Online tools:** Ensure "Loop" or "Repeat" is set to infinite/forever
   - **FFmpeg:** Use `-loop 0` parameter when converting to GIF
3. **Verify auto-replay:** Test your GIF in a web browser to confirm it loops automatically

## Temporary Solution

Until proper images are created, the walkthrough will function without images. The step descriptions and command links provide the primary guidance.