import os
import sys

import dbus
import dbus.mainloop.glib
dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)

from gi.repository import GObject
from gi.repository import TelepathyGLib as Tp

# probably a bit overkill for this sub-100 line script
def log(msg):
    if os.getenv('UPDATER_DEBUG'):
        print >> sys.stderr, msg

class SessionStatus:
    AVAILABLE = 0
    INVISIBLE = 1
    BUSY = 2
    IDLE = 3

class Updater(object):
    def __init__(self):
        self.saved_presence = None
        self.expected_presence = None

        # gnome session manager
        bus = dbus.SessionBus()
        self.session = dbus.Interface(bus.get_object(
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager/Presence'),
            'org.gnome.SessionManager.Presence')

        self.session.connect_to_signal('StatusChanged',
            self.session_status_changed_cb)

        # telepathy account manager
        self.account_manager = Tp.AccountManager.dup()
        self.account_manager.connect('most-available-presence-changed',
            self.presence_changed_cb)

        self.account_manager.prepare_async(None, self.account_manager_prepared_cb, None)

        log('set up dbus proxies')

    def account_manager_prepared_cb(self, manager, result, data):
        manager.prepare_finish(result)

        log('account manager prepared')

        presence = manager.get_most_available_presence()
        self.presence_changed_cb(manager, *presence)

    def presence_changed_cb(self, manager, presence, status, message):
        triplet = (presence, status, message)

        log('presence changed: %s' % str(triplet))

        if triplet == self.expected_presence:
            log('ignoring new presence, we set it')
            return

        log('saving presence to set later')
        self.saved_presence = triplet

    def session_status_changed_cb(self, status):
        log('new session status: %s' % status)

        new_presence = None

        if status == SessionStatus.AVAILABLE:
            if self.saved_presence is not None:
                new_presence = self.saved_presence
        elif status == SessionStatus.IDLE:
            if self.saved_presence[0] not in (Tp.ConnectionPresenceType.OFFLINE,
                                        Tp.ConnectionPresenceType.HIDDEN):
                new_presence = (Tp.ConnectionPresenceType.EXTENDED_AWAY, 'xa', '')

        if new_presence is None:
            log('not doing anything')
            return

        log('setting presence: %s' % str(new_presence))

        self.expected_presence = new_presence
        self.account_manager.set_all_requested_presences(*new_presence)

if __name__ == '__main__':
    updater = Updater()

    log('set up complete, entering mainloop')

    loop = GObject.MainLoop()
    try:
        loop.run()
    except KeyboardInterrupt:
        log('quitting...')
