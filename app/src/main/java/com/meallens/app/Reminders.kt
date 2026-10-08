package com.meallens.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Daily reminders. The page saves the reminder list and a small "today so far"
 * summary into SharedPreferences; alarms fire ReminderReceiver, which reads both,
 * skips the reminder if the goal is already met (when the reminder asks for that),
 * posts the notification and schedules the next day's alarm.
 */
object Reminders {
    const val PREFS = "meal_lens_native"
    const val KEY_REMINDERS = "reminders"
    const val KEY_SUMMARY = "summary"
    private const val KEY_SCHEDULED = "scheduled_codes"
    const val CHANNEL = "reminders"
    const val EXTRA_ID = "reminder_id"

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun ensureChannel(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            val ch = NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT)
            ch.description = "Protein and water reminders"
            nm.createNotificationChannel(ch)
        }
    }

    fun canNotify(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun canExact(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 31) return true
        return ctx.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
    }

    fun list(ctx: Context): JSONArray = try {
        JSONArray(prefs(ctx).getString(KEY_REMINDERS, "[]"))
    } catch (_: Exception) {
        JSONArray()
    }

    fun save(ctx: Context, json: String) {
        prefs(ctx).edit().putString(KEY_REMINDERS, json).apply()
        scheduleAll(ctx)
    }

    /** Cancels every alarm set before, then sets one alarm per enabled reminder. */
    fun scheduleAll(ctx: Context) {
        val p = prefs(ctx)
        p.getString(KEY_SCHEDULED, "")!!.split(",").filter { it.isNotBlank() }.forEach { code ->
            code.toIntOrNull()?.let { cancel(ctx, it) }
        }
        val codes = mutableListOf<Int>()
        val arr = list(ctx)
        for (i in 0 until arr.length()) {
            val r = arr.optJSONObject(i) ?: continue
            if (!r.optBoolean("on", false)) continue
            val id = r.optString("id")
            if (id.isEmpty()) continue
            scheduleNext(ctx, id, r.optString("time", "08:00"))
            codes.add(code(id))
        }
        p.edit().putString(KEY_SCHEDULED, codes.joinToString(",")).apply()
    }

    fun find(ctx: Context, id: String): JSONObject? {
        val arr = list(ctx)
        for (i in 0 until arr.length()) {
            val r = arr.optJSONObject(i) ?: continue
            if (r.optString("id") == id) return r
        }
        return null
    }

    private fun code(id: String) = id.hashCode() and 0x7fffffff

    private fun pending(ctx: Context, id: String?, code: Int): PendingIntent {
        val intent = Intent(ctx, ReminderReceiver::class.java).setAction("com.meallens.app.REMIND.$code")
        if (id != null) intent.putExtra(EXTRA_ID, id)
        return PendingIntent.getBroadcast(
            ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun cancel(ctx: Context, code: Int) {
        ctx.getSystemService(AlarmManager::class.java).cancel(pending(ctx, null, code))
    }

    fun scheduleNext(ctx: Context, id: String, time: String) {
        val parts = time.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 8
        val m = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 0
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        if (cal.timeInMillis <= System.currentTimeMillis() + 1000) cal.add(Calendar.DAY_OF_YEAR, 1)
        val am = ctx.getSystemService(AlarmManager::class.java)
        val pi = pending(ctx, id, code(id))
        if (canExact(ctx)) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        }
    }

    fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    /** Today's numbers as last saved by the page; zeros when nothing was logged today. */
    fun summary(ctx: Context): JSONObject {
        val s = try { JSONObject(prefs(ctx).getString(KEY_SUMMARY, "{}")) } catch (_: Exception) { JSONObject() }
        if (s.optString("date") != today()) {
            s.put("protein", 0).put("kcal", 0).put("water", 0).put("taken", org.json.JSONArray()).put("date", today())
        }
        return s
    }

    /** Title and text for a reminder, or null when it should stay quiet. */
    fun message(ctx: Context, r: JSONObject): Pair<String, String>? {
        val s = summary(ctx)
        val kind = r.optString("kind", "protein")
        val smart = r.optBoolean("smart", true)
        val label = r.optString("label").ifBlank { if (kind == "water") "Water" else "Protein" }
        return if (kind == "supplement") {
            val sid = r.optString("suppId")
            val taken = s.optJSONArray("taken")
            if (smart && taken != null) {
                for (i in 0 until taken.length()) if (taken.optString(i) == sid) return null
            }
            val dose = r.optString("dose")
            label to (if (dose.isNotBlank()) "Take $dose." else "Time for your supplement.")
        } else if (kind == "water") {
            val have = s.optDouble("water", 0.0).roundToInt()
            val goal = s.optDouble("waterGoal", 100.0).roundToInt()
            val unit = s.optString("waterUnit", "oz")
            if (smart && have >= goal) return null
            label to "$have of $goal $unit so far today. ${goal - have} $unit to go."
        } else {
            val have = s.optDouble("protein", 0.0).roundToInt()
            val goal = s.optInt("goal", 130)
            if (smart && have >= goal) return null
            val text = if (have == 0) "Nothing logged yet today. Your goal is $goal g of protein."
            else "$have of $goal g protein so far. ${goal - have} g to go."
            label to text
        }
    }

    fun post(ctx: Context, id: Int, title: String, text: String) {
        if (!canNotify(ctx)) return
        ensureChannel(ctx)
        val open = PendingIntent.getActivity(
            ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = android.app.Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(android.app.Notification.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(id, n)
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra(Reminders.EXTRA_ID) ?: return
        val r = Reminders.find(ctx, id) ?: return
        if (!r.optBoolean("on", false)) return
        Reminders.message(ctx, r)?.let { (title, text) ->
            Reminders.post(ctx, id.hashCode() and 0x7fffffff, title, text)
        }
        // Set tomorrow's alarm for this reminder.
        Reminders.scheduleNext(ctx, id, r.optString("time", "08:00"))
    }
}

/** Alarms are cleared on reboot, time-zone or clock changes, and app updates; set them again. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Reminders.scheduleAll(ctx)
        ProgressWidget.updateAll(ctx)
    }
}
