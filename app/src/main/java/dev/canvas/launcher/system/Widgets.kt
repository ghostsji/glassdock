package dev.canvas.launcher.system

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.UserManager
import android.util.SizeF
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import kotlin.math.abs
import kotlin.math.ceil

/** A widget view that reports long-presses even when the widget's own views eat the touch. */
class LongPressWidgetView(context: Context) : AppWidgetHostView(context) {
    var onLongPress: (() -> Unit)? = null
    private var fired = false
    private var downX = 0f
    private var downY = 0f
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private val trigger = Runnable {
        fired = true
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        onLongPress?.invoke()
    }

    private fun track(ev: MotionEvent) {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                fired = false; downX = ev.x; downY = ev.y
                postDelayed(trigger, ViewConfiguration.getLongPressTimeout().toLong())
            }
            MotionEvent.ACTION_MOVE ->
                if (abs(ev.x - downX) > slop || abs(ev.y - downY) > slop) removeCallbacks(trigger)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN ->
                removeCallbacks(trigger)
        }
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        track(ev)
        return fired
    }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
        // DOWN always passes through onInterceptTouchEvent first; don't schedule twice.
        if (ev.actionMasked != MotionEvent.ACTION_DOWN) track(ev)
        super.onTouchEvent(ev)
        return true
    }
}

class WidgetHostManager(private val context: Context) {
    val manager: AppWidgetManager = AppWidgetManager.getInstance(context)

    val host: AppWidgetHost = object : AppWidgetHost(context, HOST_ID) {
        override fun onCreateView(context: Context, appWidgetId: Int, appWidget: AppWidgetProviderInfo?): AppWidgetHostView =
            LongPressWidgetView(context)
    }

    /** Widget providers from every profile (personal + work). */
    fun providers(): List<AppWidgetProviderInfo> {
        val um = context.getSystemService(UserManager::class.java)
        return um.userProfiles.flatMap { runCatching { manager.getInstalledProvidersForProfile(it) }.getOrDefault(emptyList()) }
    }

    fun info(widgetId: Int): AppWidgetProviderInfo? = manager.getAppWidgetInfo(widgetId)

    fun createView(ctx: Context, widgetId: Int): LongPressWidgetView? {
        val info = info(widgetId) ?: return null
        return host.createView(ctx, widgetId, info) as? LongPressWidgetView
    }

    fun delete(widgetId: Int) = runCatching { host.deleteAppWidgetId(widgetId) }

    /** Tells the widget how big it is so it can pick the right layout. */
    fun updateSize(view: AppWidgetHostView, widthDp: Float, heightDp: Float) {
        if (Build.VERSION.SDK_INT >= 31) {
            view.updateAppWidgetSize(Bundle(), listOf(SizeF(widthDp, heightDp)))
        } else {
            @Suppress("DEPRECATION")
            view.updateAppWidgetSize(null, widthDp.toInt(), heightDp.toInt(), widthDp.toInt(), heightDp.toInt())
        }
    }

    fun needsConfiguration(info: AppWidgetProviderInfo): Boolean {
        if (info.configure == null) return false
        if (Build.VERSION.SDK_INT >= 31 &&
            (info.widgetFeatures and AppWidgetProviderInfo.WIDGET_FEATURE_CONFIGURATION_OPTIONAL) != 0
        ) return false
        return true
    }

    /** Suggested grid span for a new widget. */
    fun spanFor(info: AppWidgetProviderInfo, columns: Int, rows: Int): Pair<Int, Int> {
        if (Build.VERSION.SDK_INT >= 31 && info.targetCellWidth > 0 && info.targetCellHeight > 0) {
            return info.targetCellWidth.coerceIn(1, columns) to info.targetCellHeight.coerceIn(1, rows)
        }
        val dm = context.resources.displayMetrics
        val cellW = dm.widthPixels / dm.density / columns
        val cellH = dm.heightPixels / dm.density * 0.62f / rows
        val w = ceil(info.minWidth / dm.density / cellW).toInt().coerceIn(1, columns)
        val h = ceil(info.minHeight / dm.density / cellH).toInt().coerceIn(1, rows)
        return w to h
    }

    companion object { const val HOST_ID = 0x0CA5 }
}
