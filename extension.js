/*
 * Copyright (C) 2014 Jonny Lamb <jonnylamb@jonnylamb.com>
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 */

const Lang = imports.lang;
const GLib = imports.gi.GLib;
const GnomeSession = imports.misc.gnomeSession;
const Tp = imports.gi.TelepathyGLib;

let debugEnabled = false;

let updater = null;

const PresenceUpdater = new Lang.Class({
    Name: 'PresenceUpdater',

    _init: function() {
        this._presence = new GnomeSession.Presence();
        this._presence.connectSignal('StatusChanged', Lang.bind(this, function(proxy, senderName, [status]) {
            this._sessionStatusChanged(status);
        }));

        this._savedPresence = undefined;
        this._savedMessage = undefined;
        this._expectedPresence = undefined;

        this._accountMgr = Tp.AccountManager.dup();
        this._presenceChangedId = this._accountMgr.connect('most-available-presence-changed',
                                                           Lang.bind(this, this._IMStatusChanged));

        debug('finished initialising PresenceUpdater object');
    },

    destroy: function() {
        debug('destroying PresenceUpdater');
        // clean up signal handlers
        if (this._presenceChangedId != 0)
            this._accountMgr.disconnect(this._presenceChangedId);
        this._presenceChangedId = 0;
    },

    _statusForPresence: function(presence) {
        switch(presence) {
            case Tp.ConnectionPresenceType.AVAILABLE:
                return 'available';
            case Tp.ConnectionPresenceType.BUSY:
                return 'busy';
            case Tp.ConnectionPresenceType.OFFLINE:
                return 'offline';
            case Tp.ConnectionPresenceType.HIDDEN:
                return 'hidden';
            case Tp.ConnectionPresenceType.AWAY:
                return 'away';
            case Tp.ConnectionPresenceType.EXTENDED_AWAY:
                return 'xa';
            default:
                return 'unknown';
        }
    },

    _IMStatusChanged: function(accountMgr, presence, status, message) {
        debug('IM status changed: ' + presence);
        if (presence == this._expectedPresence) {
            debug('... expected this presence update, ignoring it');
            return;
        }

        debug('saving new presence for when session goes to idle');

        this._savedPresence = presence;
        this._savedMessage = message;
    },

    _sessionStatusChanged: function(sessionStatus) {
        let newPresence, status, msg;

        debug('session status changed: ' + sessionStatus);

        if (sessionStatus == GnomeSession.PresenceStatus.AVAILABLE) {
            newPresence = this._savedPresence;
            msg = this._savedMessage;
        } else if (sessionStatus == GnomeSession.PresenceStatus.IDLE) {
            // Only change presence if the current one is "more present" than
            // idle
            if (this._savedPresence != Tp.ConnectionPresenceType.OFFLINE &&
                this._savedPresence != Tp.ConnectionPresenceType.HIDDEN) {
                newPresence = Tp.ConnectionPresenceType.EXTENDED_AWAY;
            }
        } else {
            return;
        }

        status = this._statusForPresence(newPresence);
        msg = msg ? msg : '';

        debug('setting IM presence: [' + newPresence + ', ' + status + ', ' + msg + ']');

        this._expectedPresence = newPresence;
        this._accountMgr.set_all_requested_presences(newPresence, status, msg);
    }
});

function debug(message) {
    if (debugEnabled)
        log('IM-PRESENCE-UPDATES: ' + message);
}

function init() {
    if (GLib.getenv('IM_PRESENCE_UPDATES_DEBUG')) {
        debugEnabled = true;
        debug('initialising');
    }
}

function enable() {
    debug('enabling');

    updater = new PresenceUpdater();
}

function disable() {
    debug('disabling');

    delete updater;
}