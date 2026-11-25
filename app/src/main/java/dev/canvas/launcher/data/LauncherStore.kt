package dev.canvas.launcher.data

import android.content.Context
import android.util.AtomicFile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import java.io.File

/** Per-app customisations that are not part of the visual config. */
@Serializable
data class AppPrefs(
    val hidden: Set<String> = emptySet(),
    val labels: Map<String, String> = emptyMap(),
    val icons: Map<String, IconRef> = emptyMap(),
    val launches: Map<String, Int> = emptyMap(),
)

/** A drawable inside an icon pack. */
@Serializable
data class IconRef(val pack: String, val drawable: String)

/** Everything in one file, for export / import. */
@Serializable
data class Backup(
    val version: Int = 1,
    val config: LauncherConfig = LauncherConfig(),
    val layout: HomeLayout? = null,
    val prefs: AppPrefs? = null,
)

@OptIn(FlowPreview::class)
class LauncherStore(private val context: Context, private val scope: CoroutineScope) {

    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        coerceInputValues = true
        prettyPrint = true
    }

    /** True when there was no saved layout at startup (first launch). */
    val isFirstRun: Boolean = !File(context.filesDir, LAYOUT_FILE).exists()

    private val _config = persisted(CONFIG_FILE, LauncherConfig(), serializer())
    private val _layout = persisted(LAYOUT_FILE, HomeLayout(), serializer())
    private val _prefs = persisted(PREFS_FILE, AppPrefs(), serializer())

    val config: StateFlow<LauncherConfig> = _config.asStateFlow()
    val layout: StateFlow<HomeLayout> = _layout.asStateFlow()
    val prefs: StateFlow<AppPrefs> = _prefs.asStateFlow()

    fun updateConfig(transform: (LauncherConfig) -> LauncherConfig) {
        val before = _config.value
        _config.update(transform)
        val after = _config.value
        // Shrinking the grid or dock must never lose items.
        if (before.home.columns != after.home.columns || before.home.rows != after.home.rows ||
            before.dock.slots != after.dock.slots
        ) {
            _layout.update { LayoutOps.reflow(it, after.home.columns, after.home.rows, after.dock.slots) }
        }
    }

    fun updateLayout(transform: (HomeLayout) -> HomeLayout) = _layout.update(transform)
    fun updatePrefs(transform: (AppPrefs) -> AppPrefs) = _prefs.update(transform)

    fun recordLaunch(appKey: String) = _prefs.update {
        it.copy(launches = it.launches + (appKey to (it.launches[appKey] ?: 0) + 1))
    }

    fun exportJson(includeLayout: Boolean): String = json.encodeToString(
        Backup.serializer(),
        Backup(
            config = _config.value,
            layout = if (includeLayout) _layout.value else null,
            prefs = if (includeLayout) _prefs.value else null,
        ),
    )

    /** Returns null on success, or an error message. */
    fun importJson(text: String): String? = runCatching {
        val backup = json.decodeFromString(Backup.serializer(), text)
        _config.value = backup.config
        backup.layout?.let { _layout.value = it }
        backup.prefs?.let { _prefs.value = it }
    }.exceptionOrNull()?.let { it.message ?: "That file isn't a Canvas backup." }

    fun resetConfig() { _config.value = LauncherConfig() }

    private fun <T> persisted(name: String, default: T, ser: KSerializer<T>): MutableStateFlow<T> {
        val file = File(context.filesDir, name)
        val initial = runCatching { json.decodeFromString(ser, file.readText()) }.getOrDefault(default)
        val flow = MutableStateFlow(initial)
        scope.launch(Dispatchers.IO) {
            flow.drop(1).debounce(250).collect { value ->
                val atomic = AtomicFile(file)
                val out = atomic.startWrite()
                try {
                    out.write(json.encodeToString(ser, value).toByteArray())
                    atomic.finishWrite(out)
                } catch (e: Exception) {
                    atomic.failWrite(out)
                }
            }
        }
        return flow
    }

    companion object {
        const val CONFIG_FILE = "config.json"
        const val LAYOUT_FILE = "layout.json"
        const val PREFS_FILE = "app_prefs.json"
    }
}
