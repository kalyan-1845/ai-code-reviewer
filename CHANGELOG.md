# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Frontend:** Clear-filter ("X") button in the File Navigator search bar ([#998](https://github.com/kalyan-1845/ai-code-reviewer/issues/998))
  - Conditionally rendered `<X>` icon (via `lucide-react`) inside the search input when `fileFilterQuery` is non-empty.
  - Clicking the button resets the search state to `''`, instantly restoring the full file tree.
  - Includes hover visual feedback (`rgba(255,255,255,0.1)` background) and `aria-label="Clear search"` for accessibility.
  - Input right-padding (`30px`) prevents typed text from overlapping behind the icon.
