package com.meallens.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import kotlin.math.roundToInt

/** Home-screen widget: today's protein against the goal, plus water. Tap to open the app. */
class ProgressWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, views(ctx)) }
    }

    companion object {
        fun updateAll(ctx: Context) {
            val manager = AppWidgetManager.getInstance(ctx)
            val ids = manager.getAppWidgetIds(ComponentName(ctx, ProgressWidget::class.java))
            if (ids.isNotEmpty()) ids.forEach { manager.updateAppWidget(it, views(ctx)) }
        }

        private fun views(ctx: Context): RemoteViews {
            val s = Reminders.summary(ctx)
            val protein = s.optDouble("protein", 0.0).roundToInt()
            val goal = s.optInt("goal", 130).coerceAtLeast(1)
            val water = s.optInt("water", 0)
            val waterGoal = s.optInt("waterGoal", 8)
            val left = goal - protein

            val v = RemoteViews(ctx.packageName, R.layout.widget_progress)
            v.setTextViewText(R.id.w_protein, "$protein")
            v.setTextViewText(R.id.w_goal, "/ $goal g protein")
            v.setProgressBar(R.id.w_bar, goal, protein.coerceAtMost(goal), false)
            v.setTextViewText(
                R.id.w_left,
                if (left > 0) "$left g to go · water $water/$waterGoal" else "Goal reached · water $water/$waterGoal"
            )
            val open = PendingIntent.getActivity(
                ctx, 1,
                Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            v.setOnClickPendingIntent(R.id.w_root, open)
            return v
        }
    }
}
