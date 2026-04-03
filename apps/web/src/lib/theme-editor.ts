import { db, eq, and } from '@aidepedia/db';
import { organization_branding, theme_presets } from '@aidepedia/db/schema';

/**
 * Theme configuration types
 */
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface ThemeFonts {
  heading: string;
  body: string;
}

export interface ThemeConfig {
  borderRadius?: string;
  buttonStyle?: 'rounded' | 'square' | 'pill';
  cardStyle?: 'elevated' | 'outlined' | 'flat';
  headerStyle?: 'fixed' | 'static' | 'minimal';
}

export interface Theme {
  colors: ThemeColors;
  fonts: ThemeFonts;
  themeConfig: ThemeConfig;
  customCss?: string;
}

export interface ThemePreset {
  id: number;
  organizationId: number | null;
  name: string;
  description: string | null;
  isPublic: boolean;
  config: Theme;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default theme presets
 */
export const DEFAULT_PRESETS: Array<Omit<ThemePreset, 'id' | 'organizationId' | 'useCount' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'Light Default',
    description: 'Clean and modern light theme',
    isPublic: true,
    config: {
      colors: {
        primary: '#3B82F6',
        secondary: '#1E40AF',
        accent: '#F59E0B',
        background: '#FFFFFF',
        text: '#1F2937',
      },
      fonts: {
        heading: 'Inter',
        body: 'Inter',
      },
      themeConfig: {
        borderRadius: '8px',
        buttonStyle: 'rounded',
        cardStyle: 'elevated',
        headerStyle: 'fixed',
      },
    },
  },
  {
    name: 'Dark Mode',
    description: 'Easy on the eyes dark theme',
    isPublic: true,
    config: {
      colors: {
        primary: '#60A5FA',
        secondary: '#3B82F6',
        accent: '#FBBF24',
        background: '#111827',
        text: '#F9FAFB',
      },
      fonts: {
        heading: 'Inter',
        body: 'Inter',
      },
      themeConfig: {
        borderRadius: '8px',
        buttonStyle: 'rounded',
        cardStyle: 'elevated',
        headerStyle: 'fixed',
      },
    },
  },
  {
    name: 'Corporate Blue',
    description: 'Professional blue theme for enterprises',
    isPublic: true,
    config: {
      colors: {
        primary: '#1E3A8A',
        secondary: '#1E40AF',
        accent: '#F59E0B',
        background: '#F3F4F6',
        text: '#1F2937',
      },
      fonts: {
        heading: 'Roboto',
        body: 'Roboto',
      },
      themeConfig: {
        borderRadius: '4px',
        buttonStyle: 'square',
        cardStyle: 'outlined',
        headerStyle: 'static',
      },
    },
  },
];

/**
 * Get branding for an organization
 */
export async function getOrganizationBranding(organizationId: number) {
  const [branding] = await db
    .select()
    .from(organization_branding)
    .where(eq(organization_branding.organizationId, organizationId))
    .limit(1);

  return branding || null;
}

/**
 * Update theme for an organization
 */
export async function updateTheme(
  organizationId: number,
  theme: Partial<Theme>,
  userId: number
): Promise<void> {
  const existingBranding = await getOrganizationBranding(organizationId);

  if (!existingBranding) {
    // Create new branding entry
    await db.insert(organization_branding).values({
      organizationId,
      primaryColor: theme.colors?.primary || '#3B82F6',
      secondaryColor: theme.colors?.secondary || '#1E40AF',
      accentColor: theme.colors?.accent || '#F59E0B',
      backgroundColor: theme.colors?.background || '#FFFFFF',
      textColor: theme.colors?.text || '#1F2937',
      fontHeading: theme.fonts?.heading || 'Inter',
      fontBody: theme.fonts?.body || 'Inter',
      themeConfig: theme.themeConfig || {},
      customCss: theme.customCss,
      themePreset: 'custom',
      updatedAt: new Date(),
    });
  } else {
    // Update existing branding
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (theme.colors) {
      if (theme.colors.primary) updateData.primaryColor = theme.colors.primary;
      if (theme.colors.secondary) updateData.secondaryColor = theme.colors.secondary;
      if (theme.colors.accent) updateData.accentColor = theme.colors.accent;
      if (theme.colors.background) updateData.backgroundColor = theme.colors.background;
      if (theme.colors.text) updateData.textColor = theme.colors.text;
    }

    if (theme.fonts) {
      if (theme.fonts.heading) updateData.fontHeading = theme.fonts.heading;
      if (theme.fonts.body) updateData.fontBody = theme.fonts.body;
    }

    if (theme.themeConfig) {
      updateData.themeConfig = theme.themeConfig;
    }

    if (theme.customCss !== undefined) {
      updateData.customCss = theme.customCss;
    }

    await db
      .update(organization_branding)
      .set(updateData)
      .where(eq(organization_branding.organizationId, organizationId));
  }

  // Log the theme update
  await logBrandingChange(organizationId, userId, 'update', 'branding', undefined, { theme });
}

/**
 * Apply a theme preset to an organization
 */
export async function applyThemePreset(
  organizationId: number,
  presetId: number,
  userId: number
): Promise<void> {
  const [preset] = await db
    .select()
    .from(theme_presets)
    .where(eq(theme_presets.id, presetId))
    .limit(1);

  if (!preset) {
    throw new Error('Theme preset not found');
  }

  // Apply the preset theme
  await updateTheme(organizationId, preset.config as Theme, userId);

  // Increment use count
  await db
    .update(theme_presets)
    .set({ useCount: (preset.useCount || 0) + 1 })
    .where(eq(theme_presets.id, presetId));
}

/**
 * Create a custom theme preset from current branding
 */
export async function createThemePreset(
  organizationId: number,
  name: string,
  description: string | null,
  isPublic: boolean,
  userId: number
): Promise<number> {
  const branding = await getOrganizationBranding(organizationId);

  if (!branding) {
    throw new Error('No branding found for organization');
  }

  const theme: Theme = {
    colors: {
      primary: branding.primaryColor || '#3B82F6',
      secondary: branding.secondaryColor || '#1E40AF',
      accent: branding.accentColor || '#F59E0B',
      background: branding.backgroundColor || '#FFFFFF',
      text: branding.textColor || '#1F2937',
    },
    fonts: {
      heading: branding.fontHeading || 'Inter',
      body: branding.fontBody || 'Inter',
    },
    themeConfig: (branding.themeConfig as ThemeConfig) || {},
    customCss: branding.customCss || undefined,
  };

  const [preset] = await db
    .insert(theme_presets)
    .values({
      organizationId,
      name,
      description,
      isPublic,
      config: theme,
      useCount: 0,
    })
    .returning({ id: theme_presets.id });

  await logBrandingChange(organizationId, userId, 'create', 'theme_preset', preset.id, { name, isPublic });

  return preset.id;
}

/**
 * Get available theme presets for an organization
 */
export async function getThemePresets(organizationId: number): Promise<ThemePreset[]> {
  const presets = await db
    .select()
    .from(theme_presets)
    .where(
      and(
        eq(theme_presets.isPublic, true),
        // Also include organization's private presets
      )
    );

  // Also get organization's private presets
  const orgPresets = await db
    .select()
    .from(theme_presets)
    .where(eq(theme_presets.organizationId, organizationId));

  return [...presets, ...orgPresets] as ThemePreset[];
}

/**
 * Export theme configuration
 */
export async function exportTheme(organizationId: number): Promise<Theme> {
  const branding = await getOrganizationBranding(organizationId);

  if (!branding) {
    throw new Error('No branding found for organization');
  }

  return {
    colors: {
      primary: branding.primaryColor || '#3B82F6',
      secondary: branding.secondaryColor || '#1E40AF',
      accent: branding.accentColor || '#F59E0B',
      background: branding.backgroundColor || '#FFFFFF',
      text: branding.textColor || '#1F2937',
    },
    fonts: {
      heading: branding.fontHeading || 'Inter',
      body: branding.fontBody || 'Inter',
    },
    themeConfig: (branding.themeConfig as ThemeConfig) || {},
    customCss: branding.customCss || undefined,
  };
}

/**
 * Import theme configuration
 */
export async function importTheme(
  organizationId: number,
  theme: Theme,
  userId: number
): Promise<void> {
  // Validate theme structure
  if (!theme.colors || !theme.fonts) {
    throw new Error('Invalid theme configuration');
  }

  await updateTheme(organizationId, theme, userId);
}

/**
 * Reset theme to default
 */
export async function resetTheme(organizationId: number, userId: number): Promise<void> {
  const defaultTheme = DEFAULT_PRESETS[0].config;

  await updateTheme(organizationId, defaultTheme, userId);

  await logBrandingChange(organizationId, userId, 'reset', 'branding');
}

/**
 * Generate CSS variables from theme
 */
export function generateCSSVariables(theme: Theme): string {
  return `
    :root {
      --color-primary: ${theme.colors.primary};
      --color-secondary: ${theme.colors.secondary};
      --color-accent: ${theme.colors.accent};
      --color-background: ${theme.colors.background};
      --color-text: ${theme.colors.text};
      --font-heading: ${theme.fonts.heading};
      --font-body: ${theme.fonts.body};
      ${theme.themeConfig.borderRadius ? `--border-radius: ${theme.themeConfig.borderRadius};` : ''}
    }
  `.trim();
}

/**
 * Log branding changes for audit trail
 */
async function logBrandingChange(
  organizationId: number,
  userId: number,
  action: 'create' | 'update' | 'delete' | 'reset' | 'export' | 'import',
  resourceType: 'branding' | 'domain' | 'email_template' | 'theme_preset',
  resourceId?: number,
  changes?: any
): Promise<void> {
  // This would be implemented with the branding_audit_log table
  // For now, we'll just console log
  console.log('Branding change:', {
    organizationId,
    userId,
    action,
    resourceType,
    resourceId,
    changes,
    timestamp: new Date(),
  });
}
