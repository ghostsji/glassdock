package dev.canvas.launcher.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.core.graphics.ColorUtils
import dev.canvas.launcher.data.AccentSource
import dev.canvas.launcher.data.FontChoice
import dev.canvas.launcher.data.ThemeConfig
import dev.canvas.launcher.data.ThemeMode

@Composable
fun isDark(cfg: ThemeConfig): Boolean = when (cfg.mode) {
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
    ThemeMode.LIGHT -> false
    ThemeMode.DARK, ThemeMode.AMOLED -> true
}

fun FontChoice.family(): FontFamily = when (this) {
    FontChoice.DEFAULT -> FontFamily.Default
    FontChoice.SANS -> FontFamily.SansSerif
    FontChoice.SERIF -> FontFamily.Serif
    FontChoice.MONO -> FontFamily.Monospace
    FontChoice.CURSIVE -> FontFamily.Cursive
}

@Composable
fun CanvasTheme(cfg: ThemeConfig, content: @Composable () -> Unit) {
    val dark = isDark(cfg)
    val ctx = LocalContext.current

    var scheme = if (cfg.accentSource == AccentSource.WALLPAPER && Build.VERSION.SDK_INT >= 31) {
        if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
    } else seedScheme(Color(cfg.customAccent), dark)

    if (cfg.mode == ThemeMode.AMOLED) {
        scheme = scheme.copy(
            background = Color.Black, surface = Color.Black,
            surfaceContainerLowest = Color.Black, surfaceContainerLow = Color(0xFF0A0A0A),
            surfaceContainer = Color(0xFF111111), surfaceContainerHigh = Color(0xFF181818),
            surfaceContainerHighest = Color(0xFF202020),
        )
    }
    if (cfg.highContrast) {
        val fg = if (dark) Color.White else Color.Black
        scheme = scheme.copy(onSurface = fg, onBackground = fg, onSurfaceVariant = fg, outline = fg.copy(alpha = 0.7f))
    }

    val family = cfg.font.family()
    val base = Typography()
    fun TextStyle.f() = copy(fontFamily = family)
    val typography = Typography(
        displayLarge = base.displayLarge.f(), displayMedium = base.displayMedium.f(), displaySmall = base.displaySmall.f(),
        headlineLarge = base.headlineLarge.f(), headlineMedium = base.headlineMedium.f(), headlineSmall = base.headlineSmall.f(),
        titleLarge = base.titleLarge.f(), titleMedium = base.titleMedium.f(), titleSmall = base.titleSmall.f(),
        bodyLarge = base.bodyLarge.f(), bodyMedium = base.bodyMedium.f(), bodySmall = base.bodySmall.f(),
        labelLarge = base.labelLarge.f(), labelMedium = base.labelMedium.f(), labelSmall = base.labelSmall.f(),
    )
    val r = cfg.cornerRadius
    val shapes = Shapes(
        extraSmall = RoundedCornerShape((r / 4).dp), small = RoundedCornerShape((r / 2).dp),
        medium = RoundedCornerShape((r * 3 / 4).dp), large = RoundedCornerShape(r.dp),
        extraLarge = RoundedCornerShape((r * 5 / 4).dp),
    )

    val density = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(density.density, density.fontScale * cfg.fontScale)) {
        MaterialTheme(colorScheme = scheme, typography = typography, shapes = shapes, content = content)
    }
}

/** A Material-like scheme derived from one seed colour (used on Android < 12 or with a custom accent). */
fun seedScheme(seed: Color, dark: Boolean): ColorScheme {
    val hsl = FloatArray(3)
    ColorUtils.colorToHSL(seed.toArgb(), hsl)
    fun tone(l: Float, sat: Float = hsl[1], hue: Float = hsl[0]) = Color(ColorUtils.HSLToColor(floatArrayOf(hue, sat.coerceIn(0f, 1f), l)))
    val secHue = (hsl[0] + 30f) % 360f
    val terHue = (hsl[0] + 60f) % 360f
    return if (dark) darkColorScheme(
        primary = tone(0.75f), onPrimary = tone(0.15f), primaryContainer = tone(0.3f), onPrimaryContainer = tone(0.9f),
        secondary = tone(0.75f, hsl[1] * 0.5f, secHue), onSecondary = tone(0.15f, hsl[1] * 0.5f, secHue),
        secondaryContainer = tone(0.28f, hsl[1] * 0.4f, secHue), onSecondaryContainer = tone(0.9f, hsl[1] * 0.4f, secHue),
        tertiary = tone(0.75f, hsl[1] * 0.6f, terHue), tertiaryContainer = tone(0.3f, hsl[1] * 0.5f, terHue),
        background = tone(0.07f, hsl[1] * 0.15f), surface = tone(0.07f, hsl[1] * 0.15f),
        surfaceVariant = tone(0.2f, hsl[1] * 0.15f), onSurfaceVariant = tone(0.8f, hsl[1] * 0.1f),
        surfaceContainerLowest = tone(0.05f, hsl[1] * 0.12f), surfaceContainerLow = tone(0.09f, hsl[1] * 0.12f),
        surfaceContainer = tone(0.12f, hsl[1] * 0.12f), surfaceContainerHigh = tone(0.15f, hsl[1] * 0.12f),
        surfaceContainerHighest = tone(0.19f, hsl[1] * 0.12f),
    ) else lightColorScheme(
        primary = tone(0.4f), onPrimary = Color.White, primaryContainer = tone(0.9f), onPrimaryContainer = tone(0.12f),
        secondary = tone(0.4f, hsl[1] * 0.4f, secHue), onSecondary = Color.White,
        secondaryContainer = tone(0.9f, hsl[1] * 0.4f, secHue), onSecondaryContainer = tone(0.12f, hsl[1] * 0.4f, secHue),
        tertiary = tone(0.4f, hsl[1] * 0.6f, terHue), tertiaryContainer = tone(0.9f, hsl[1] * 0.5f, terHue),
        background = tone(0.98f, hsl[1] * 0.3f), surface = tone(0.98f, hsl[1] * 0.3f),
        surfaceVariant = tone(0.9f, hsl[1] * 0.2f), onSurfaceVariant = tone(0.3f, hsl[1] * 0.1f),
        surfaceContainerLowest = Color.White, surfaceContainerLow = tone(0.96f, hsl[1] * 0.25f),
        surfaceContainer = tone(0.94f, hsl[1] * 0.25f), surfaceContainerHigh = tone(0.92f, hsl[1] * 0.25f),
        surfaceContainerHighest = tone(0.9f, hsl[1] * 0.25f),
    )
}
