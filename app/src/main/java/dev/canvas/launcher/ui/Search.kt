package dev.canvas.launcher.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.net.Uri
import android.os.UserHandle
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Shop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import dev.canvas.launcher.system.Calculator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.Normalizer

fun normalizeForSearch(s: String): String =
    Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")

/** 0 = no match; higher = better. Handles accents, word starts, initials ("gm" → Google Maps) and fuzzy typing. */
fun matchScore(label: String, query: String, fuzzy: Boolean): Int {
    val l = normalizeForSearch(label)
    val q = normalizeForSearch(query).trim()
    if (q.isEmpty()) return 1
    if (l == q) return 120
    if (l.startsWith(q)) return 100
    val words = l.split(' ', '-', '_', '.').filter { it.isNotEmpty() }
    if (words.any { it.startsWith(q) }) return 80
    if (l.contains(q)) return 60
    if (!fuzzy) return 0
    val initials = words.joinToString("") { it.take(1) }
    if (initials.startsWith(q.replace(" ", ""))) return 50
    var i = 0
    for (c in l) if (i < q.length && c == q[i]) i++
    return if (i == q.length && q.length >= 2) 20 else 0
}

private data class Contact(val id: Long, val lookup: String, val name: String)

private fun queryContacts(ctx: Context, q: String): List<Contact> {
    val uri = Uri.withAppendedPath(ContactsContract.Contacts.CONTENT_FILTER_URI, Uri.encode(q))
    val out = mutableListOf<Contact>()
    runCatching {
        ctx.contentResolver.query(
            uri,
            arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.LOOKUP_KEY, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY),
            null, null, null,
        )?.use { c ->
            while (c.moveToNext() && out.size < 6) {
                out += Contact(c.getLong(0), c.getString(1) ?: "", c.getString(2) ?: "")
            }
        }
    }
    return out
}

@Composable
fun SearchOverlay(vm: LauncherViewModel, host: LauncherHost) {
    val cfg = LocalConfig.current
    val s = cfg.search
    val ui = vm.ui
    val ctx = LocalContext.current
    val apps by vm.apps.collectAsState()
    val prefs by vm.prefs.collectAsState()
    var query by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val clipboard = LocalClipboardManager.current

    LaunchedEffect(Unit) { runCatching { focus.requestFocus() }; keyboard?.show() }

    fun close() { keyboard?.hide(); ui.searchOpen = false }

    val appResults = remember(query, apps, prefs.hidden, s) {
        if (!s.apps || query.isBlank()) emptyList()
        else apps.asSequence()
            .filter { s.includeHidden || it.key !in prefs.hidden }
            .map { it to matchScore(it.label, query, s.fuzzy) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<AppInfo, Int>> { it.second }.thenByDescending { prefs.launches[it.first.key] ?: 0 })
            .map { it.first }
            .take(12)
            .toList()
    }

    val calc = remember(query, s.calculator) {
        if (s.calculator && Calculator.looksLikeMath(query)) Calculator.evaluate(query) else null
    }

    var contactsGranted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED)
    }
    val askContacts = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { contactsGranted = it }
    val contacts by produceState(emptyList<Contact>(), query, contactsGranted, s.contacts) {
        value = if (s.contacts && contactsGranted && query.trim().length >= 2)
            withContext(Dispatchers.IO) { queryContacts(ctx, query.trim()) } else emptyList()
    }

    val allShortcuts by produceState(emptyList<Pair<ShortcutInfo, UserHandle>>(), s.shortcuts) {
        value = if (s.shortcuts) withContext(Dispatchers.IO) { vm.repo.allShortcuts() } else emptyList()
    }
    val shortcutResults = remember(query, allShortcuts) {
        if (query.isBlank()) emptyList()
        else allShortcuts.filter { (sc, _) -> matchScore((sc.shortLabel ?: "").toString(), query, false) > 0 }.take(5)
    }

    fun webSearch() {
        host.startSafely(Intent(Intent.ACTION_VIEW, Uri.parse(s.engine.url + Uri.encode(query.trim()))))
        close()
    }

    fun submit() {
        when {
            calc != null -> clipboard.setText(AnnotatedString(calc))
            s.launchOnEnter && appResults.isNotEmpty() -> { vm.launch(appResults.first(), null, host.rootView); close() }
            s.web && query.isNotBlank() -> webSearch()
        }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.97f)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
            TextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                placeholder = { Text("Search apps, contacts, maths, web…") },
                leadingIcon = { IconButton(onClick = ::close) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Close search") } },
                trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Outlined.Close, "Clear") } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { submit() }),
                shape = CircleShape,
                colors = TextFieldDefaults.colors(
                    focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                ),
                modifier = Modifier.fillMaxWidth().padding(16.dp).focusRequester(focus),
            )

            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                if (calc != null) item {
                    Card(
                        onClick = { clipboard.setText(AnnotatedString(calc)) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    ) {
                        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Calculate, null)
                            Spacer(Modifier.width(16.dp))
                            Column(Modifier.weight(1f)) {
                                Text("= $calc", style = MaterialTheme.typography.headlineMedium)
                                Text("Tap to copy", style = MaterialTheme.typography.labelSmall)
                            }
                            Icon(Icons.Outlined.ContentCopy, null)
                        }
                    }
                }

                if (appResults.isNotEmpty()) {
                    item { SearchHeader("Apps") }
                    val perRow = cfg.drawer.columns.coerceIn(3, 6)
                    items(appResults.chunked(perRow)) { row ->
                        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                            row.forEach { app ->
                                Box(Modifier.weight(1f).padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                                    AppTile(
                                        app, cfg.icons.sizeDp, showLabel = true, onWallpaper = false,
                                        modifier = Modifier.itemGestures(app.key, ItemCallbacks(
                                            onTap = { b -> vm.launch(app, b, host.rootView); close() },
                                            onLongPress = { ui.sheet = Sheet.AppMenu(app) },
                                        )),
                                    )
                                }
                            }
                            repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }

                if (shortcutResults.isNotEmpty()) {
                    item { SearchHeader("Shortcuts") }
                    items(shortcutResults, key = { (sc, u) -> "${sc.`package`}/${sc.id}/${u.hashCode()}" }) { (sc, user) ->
                        val style = rememberIconStyle(36)
                        val icon by produceState<ImageBitmap?>(null, sc.id) {
                            value = vm.icons.drawableIcon("sc:${sc.`package`}:${sc.id}|${user.hashCode()}", style) { vm.repo.shortcutIcon(sc) }
                        }
                        ResultRow(
                            title = (sc.shortLabel ?: sc.id).toString(),
                            subtitle = apps.firstOrNull { it.packageName == sc.`package` }?.label ?: sc.`package`,
                            leading = { IconBitmap(icon, 36.dp) },
                        ) { vm.repo.startShortcut(sc.`package`, sc.id, user); close() }
                    }
                }

                if (s.contacts && !contactsGranted && query.isNotBlank()) item {
                    ResultRow("Allow contact search", "Canvas only reads contacts while you search", leading = {
                        Icon(Icons.Outlined.Person, null)
                    }) { askContacts.launch(Manifest.permission.READ_CONTACTS) }
                }
                if (contacts.isNotEmpty()) {
                    item { SearchHeader("Contacts") }
                    items(contacts, key = { it.id }) { c ->
                        ResultRow(c.name, null, leading = {
                            Box(
                                Modifier.size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer),
                                contentAlignment = Alignment.Center,
                            ) { Text(c.name.take(1).uppercase(), color = MaterialTheme.colorScheme.onSecondaryContainer) }
                        }) {
                            host.startSafely(Intent(Intent.ACTION_VIEW, ContactsContract.Contacts.getLookupUri(c.id, c.lookup)))
                            close()
                        }
                    }
                }

                if (query.isNotBlank()) {
                    item { SearchHeader("More") }
                    if (s.web) item {
                        ResultRow("Search ${s.engine.label} for \"${query.trim()}\"", null, leading = { Icon(Icons.Outlined.Public, null) }) { webSearch() }
                    }
                    item {
                        ResultRow("Search Play Store", null, leading = { Icon(Icons.Outlined.Shop, null) }) {
                            host.startSafely(Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=" + Uri.encode(query.trim()))))
                            close()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchHeader(text: String) {
    Text(
        text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 24.dp, top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun ResultRow(title: String, subtitle: String?, leading: @Composable () -> Unit, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = subtitle?.let { { Text(it, maxLines = 1) } },
        leadingContent = leading,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 8.dp),
    )
}
