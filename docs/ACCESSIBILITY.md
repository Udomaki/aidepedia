# Accessibility Documentation (WCAG 2.1 AA Compliance)

This document outlines the accessibility features implemented in AIdepedia to ensure compliance with WCAG 2.1 AA standards.

## Keyboard Navigation

### Skip Links
- **Skip to main content**: Allows keyboard users to bypass navigation
- **Skip to navigation**: Direct access to main navigation menu
- Visible on focus for keyboard users

### Global Keyboard Shortcuts

#### Navigation
- `g` then `h` - Go to home page
- `g` then `a` - Go to articles list
- `g` then `n` - Create new article (authenticated users only)

#### Search
- `/` - Focus search input
- `⌘K` (Mac) / `Ctrl+K` (Windows/Linux) - Open quick actions menu

#### Article Actions
- `e` - Edit current article (when viewing an article)

#### General
- `?` - Show keyboard shortcuts help
- `Esc` - Close modals, menus, and dropdowns

### Quick Action Menu Navigation
- `↑` / `↓` - Navigate through actions
- `Enter` - Select action
- `Esc` - Close menu

## Screen Reader Support

### ARIA Labels
All interactive elements include appropriate ARIA labels:
- Navigation links and menus
- Buttons (especially icon-only buttons)
- Form inputs
- Voting buttons with state information
- Modal dialogs

### ARIA Roles and States
- `role="navigation"` on nav elements
- `role="main"` on main content areas
- `role="dialog"` and `aria-modal="true"` on modal dialogs
- `aria-pressed` on toggle buttons (voting, theme toggle)
- `aria-expanded` on dropdown menus
- `aria-selected` on selectable items
- `aria-live` regions for dynamic content updates

### Heading Hierarchy
- Proper heading structure (h1 → h2 → h3, etc.)
- Only one `h1` per page
- Headings used for structure, not styling

### Image Alt Text
All images include descriptive alt text:
- User avatars: alt="{username}"
- Article images: descriptive alt text
- Decorative images: `aria-hidden="true"`

### Live Regions
Dynamic content updates are announced to screen readers:
- Vote count changes
- Form submission status
- Error messages
- Success notifications

## Visual Accessibility

### Color Contrast
- All text meets WCAG AA contrast ratio of 4.5:1
- Large text (18pt+) meets 3:1 ratio
- Focus indicators use high-contrast colors
- Dark mode maintains proper contrast ratios

### Focus Indicators
- Visible focus indicators on all interactive elements
- 3px solid outline with 2px offset
- High contrast focus ring color (#3b82f6 light mode, #60a5fa dark mode)
- Focus-visible used to show indicators only for keyboard navigation

### Text Resizing
- Text can be resized up to 200% without loss of functionality
- Responsive design adapts to larger text sizes
- No horizontal scrolling at 200% zoom

### Color-Independent Information
- Information is never conveyed by color alone
- Status indicators use icons + text + color
- Error states use icons and text descriptions
- Links are underlined in addition to color

## Cognitive Accessibility

### Clear Language
- Simple, straightforward language
- Avoid jargon unless necessary
- Technical terms are defined

### Consistent Navigation
- Navigation appears in the same location on every page
- Navigation order is consistent
- Similar functionality works the same way across the site

### Error Prevention
- Clear error messages with suggestions for resolution
- Form validation with inline feedback
- Confirmation dialogs for destructive actions
- Draft auto-save to prevent data loss

### Timeout Warnings
- Users are warned before sessions timeout
- Option to extend sessions when possible

## Multimedia Accessibility

### Images
- All meaningful images have descriptive alt text
- Decorative images marked with `aria-hidden="true"`
- Complex images include detailed descriptions

### Video (Future Implementation)
- Captions for all video content
- Transcripts available
- Audio descriptions where needed

### Audio (Future Implementation)
- Transcripts for audio content
- Ability to pause/stop audio

## Forms and Inputs

### Labels
- All form inputs have associated labels
- Required fields clearly marked
- Helper text provided where needed

### Error Handling
- Errors announced to screen readers
- Clear, specific error messages
- Suggestions for fixing errors

### Input Validation
- Real-time validation feedback
- Clear indication of valid/invalid states
- Instructions provided before input

## Interactive Elements

### Buttons
- Clear, descriptive labels
- Visible focus states
- State changes announced (pressed, disabled, etc.)

### Links
- Descriptive link text (not "click here")
- External links open in new tab with warning
- Links to non-HTML content indicate file type

### Forms
- Logical tab order
- Focus management on submission
- Clear submit/Cancel buttons

## Modal Dialogs

### Accessibility Features
- `role="dialog"` and `aria-modal="true"`
- `aria-labelledby` points to dialog title
- Focus trapped within modal
- Escape key closes modal
- Focus returns to trigger element on close

## Reduced Motion

### Animation Preferences
- Respects `prefers-reduced-motion` media query
- Animations disabled or minimized when requested
- Essential animations remain functional

## Testing

### Automated Testing
- Lighthouse accessibility audits
- axe-core integration
- WAVE evaluation

### Manual Testing
- Keyboard-only navigation testing
- Screen reader testing (VoiceOver, NVDA)
- Color contrast verification
- Zoom testing up to 200%

## Compliance

This implementation aims to meet WCAG 2.1 AA standards, which includes:
- Level A (minimum accessibility)
- Level AA (standard accessibility)

### Known Issues
None at this time. Report accessibility issues to our GitHub repository.

### Feedback
We welcome feedback on accessibility. Please report issues via:
- GitHub Issues: https://github.com/Udomaki/aidepedia/issues
- Email: accessibility@aidepedia.com

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [MDN Accessibility Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [A11y Project](https://www.a11yproject.com/)

---

Last Updated: 2026-04-02
Version: 1.0.0
