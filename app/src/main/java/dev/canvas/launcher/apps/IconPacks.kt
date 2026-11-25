package dev.canvas.launcher.apps

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Resources
import android.graphics.drawable.Drawable
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.util.concurrent.ConcurrentHashMap

data class IconPackInfo(val packageName: String, val label: String)

/**
 * Reads icon packs made for ADW / Nova / GO launchers — the format almost every
 * pack on the Play Store supports. Mapping lives in the pack's appfilter.xml.
 */
class IconPack(private val context: Context, val packageName: String) {
    private val res: Resources = context.packageManager.getResourcesForApplication(packageName)
    private val mapping = HashMap<String, String>()

    init { parse() }

    @SuppressLint("DiscouragedApi")
    private fun parse() {
        val parser: XmlPullParser = run {
            val id = res.getIdentifier("appfilter", "xml", packageName)
            if (id != 0) res.getXml(id) else {
                val p = XmlPullParserFactory.newInstance().newPullParser()
                p.setInput(res.assets.open("appfilter.xml"), "UTF-8")
                p
            }
        }
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG && parser.name == "item") {
                val comp = parser.getAttributeValue(null, "component")
                val drawable = parser.getAttributeValue(null, "drawable")
                if (comp != null && drawable != null && comp.startsWith("ComponentInfo{") && comp.endsWith("}")) {
                    val inner = comp.substring(14, comp.length - 1)
                    ComponentName.unflattenFromString(inner)?.let { mapping.putIfAbsent(it.flattenToString(), drawable) }
                }
            }
            event = parser.next()
        }
    }

    fun drawableNameFor(component: ComponentName): String? = mapping[component.flattenToString()]

    @SuppressLint("DiscouragedApi", "UseCompatLoadingForDrawables")
    fun load(name: String, density: Int): Drawable? {
        val id = res.getIdentifier(name, "drawable", packageName)
        if (id == 0) return null
        return runCatching { res.getDrawableForDensity(id, density, null) }.getOrNull()
    }

    /** Every themed icon in the pack, for the manual icon picker. */
    val allDrawables: List<String> by lazy { mapping.values.distinct().sorted() }

    companion object {
        private val ACTIONS = listOf(
            "org.adw.launcher.THEMES", "com.gau.go.launcherex.theme",
            "com.novalauncher.THEME", "com.teslacoilsw.launcher.THEME",
        )
        private val cache = ConcurrentHashMap<String, IconPack>()

        fun installed(context: Context): List<IconPackInfo> {
            val pm = context.packageManager
            return ACTIONS.flatMap { action ->
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(Intent(action), PackageManager.GET_META_DATA)
            }.distinctBy { it.activityInfo.packageName }
                .map { IconPackInfo(it.activityInfo.packageName, it.loadLabel(pm).toString()) }
                .sortedBy { it.label.lowercase() }
        }

        fun get(context: Context, pkg: String): IconPack? =
            cache[pkg] ?: runCatching { IconPack(context, pkg) }.getOrNull()?.also { cache[pkg] = it }

        fun invalidate(pkg: String) { cache.remove(pkg) }
    }
}
