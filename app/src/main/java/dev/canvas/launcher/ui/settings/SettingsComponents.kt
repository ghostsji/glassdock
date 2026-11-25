package dev.canvas.launcher.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import dev.canvas.launcher.data.Labeled
import kotlin.math.roundToInt

@Composable
fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 24.dp, bottom = 4.dp),
    )
}

@Composable
fun NavRow(title: String, subtitle: String?, icon: ImageVector?, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = subtitle?.let { { Text(it) } },
        leadingContent = icon?.let {
            {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer),
                    contentAlignment = Alignment.Center,
                ) { Icon(it, null, tint = MaterialTheme.colorScheme.onSecondaryContainer) }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 8.dp),
    )
}

@Composable
fun SwitchRow(title: String, subtitle: String? = null, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = subtitle?.let { { Text(it) } },
        trailingContent = { Switch(checked = checked, onCheckedChange = onChange, enabled = enabled) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(enabled = enabled) { onChange(!checked) }.padding(horizontal = 8.dp),
    )
}

@Composable
fun SliderRow(
    title: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    steps: Int = 0,
    format: (Float) -> String = { "${(it * 100).roundToInt()}%" },
    onChange: (Float) -> Unit,
) {
    // Local state while dragging, committed on release (keeps the launcher from re-rendering every frame).
    var local by remember(value) { mutableFloatStateOf(value) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Text(format(local), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        }
        Slider(value = local, onValueChange = { local = it }, valueRange = range, steps = steps, onValueChangeFinished = { onChange(local) })
    }
}

@Composable
fun IntSliderRow(title: String, value: Int, range: IntRange, suffix: String = "", onChange: (Int) -> Unit) {
    SliderRow(
        title = title,
        value = value.toFloat(),
        range = range.first.toFloat()..range.last.toFloat(),
        steps = (range.last - range.first - 1).coerceAtLeast(0),
        format = { "${it.roundToInt()}$suffix" },
        onChange = { onChange(it.roundToInt()) },
    )
}

@Composable
fun <T : Labeled> ChoiceRow(title: String, value: T, options: List<T>, onChange: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(value.label) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable { open = true }.padding(horizontal = 8.dp),
    )
    if (open) ChoiceDialog(title, options.map { it.label }, options.indexOf(value), { open = false }) {
        onChange(options[it]); open = false
    }
}

@Composable
fun ChoiceDialog(title: String, labels: List<String>, selected: Int, onDismiss: () -> Unit, onPick: (Int) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            LazyColumn(Modifier.heightIn(max = 460.dp)) {
                items(labels.size) { i ->
                    Row(
                        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.small)
                            .selectable(selected = i == selected, onClick = { onPick(i) }).padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = i == selected, onClick = null)
                        Spacer(Modifier.width(12.dp))
                        Text(labels[i])
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private val swatches = listOf(
    0xFFFFFFFF, 0xFF1C1B1F, 0xFF6750A4, 0xFF3F51B5, 0xFF1E88E5, 0xFF00897B, 0xFF43A047, 0xFF7CB342,
    0xFFFDD835, 0xFFFB8C00, 0xFFE53935, 0xFFD81B60, 0xFF8E24AA, 0xFF6D4C41, 0xFF546E7A, 0xFFB0BEC5,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ColorRow(title: String, color: Long?, allowAuto: Boolean, autoLabel: String = "Automatic", onChange: (Long?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(color?.let { "#%06X".format(it and 0xFFFFFFL) } ?: autoLabel) },
        trailingContent = {
            Box(
                Modifier.size(32.dp).clip(CircleShape)
                    .background(color?.let { Color(it) } ?: MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
            )
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable { open = true }.padding(horizontal = 8.dp),
    )
    if (!open) return
    var hex by remember { mutableStateOf(color?.let { "%06X".format(it and 0xFFFFFFL) } ?: "") }
    AlertDialog(
        onDismissRequest = { open = false },
        title = { Text(title) },
        text = {
            Column {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    swatches.forEach { c ->
                        Box(
                            Modifier.size(40.dp).clip(CircleShape).background(Color(c))
                                .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                                .clickable { onChange(c); open = false },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (c == color) Icon(Icons.Outlined.Check, null,
                                tint = if (Color(c).toArgb().let { android.graphics.Color.luminance(it) } > 0.5f) Color.Black else Color.White)
                        }
                    }
                }
                Spacer(Modifier.size(16.dp))
                OutlinedTextField(
                    value = hex,
                    onValueChange = { hex = it.removePrefix("#").take(6).uppercase() },
                    label = { Text("Hex colour") },
                    prefix = { Text("#") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                hex.toLongOrNull(16)?.takeIf { hex.length == 6 }?.let { onChange(0xFF000000 or it) }
                open = false
            }) { Text("Use hex") }
        },
        dismissButton = {
            Row {
                if (allowAuto) TextButton(onClick = { onChange(null); open = false }) { Text(autoLabel) }
                TextButton(onClick = { open = false }) { Text("Cancel") }
            }
        },
    )
}
