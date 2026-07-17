'use client';

import { useState } from 'react';

export default function SchedulerPanel() {
  const [schedule, setSchedule] = useState({
    frequency: 'daily',
    time: '09:00',
    enabled: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Schedule updated:', schedule);
    // TODO: Save to backend
  };

  return (
    <div className="scheduler-panel">
      <h3>Update Schedule</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="frequency">Frequency</label>
          <select
            id="frequency"
            value={schedule.frequency}
            onChange={(e) =>
              setSchedule({ ...schedule, frequency: e.target.value })
            }
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="time">Time</label>
          <input
            id="time"
            type="time"
            value={schedule.time}
            onChange={(e) =>
              setSchedule({ ...schedule, time: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label htmlFor="enabled">
            <input
              id="enabled"
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) =>
                setSchedule({ ...schedule, enabled: e.target.checked })
              }
            />
            Enable scheduling
          </label>
        </div>

        <button type="submit" className="btn-submit">
          Save Schedule
        </button>
      </form>
    </div>
  );
}
