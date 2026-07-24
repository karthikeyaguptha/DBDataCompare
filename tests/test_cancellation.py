from threading import Event

from db_compare.cancellation import CancellationController


def test_controller_invokes_registered_cancellation():
    called = Event()
    controller = CancellationController()
    controller.register(called.set)

    assert controller.cancel_now() == 1
    assert called.wait(1)
    assert controller.cancelled


def test_controller_invokes_late_registration_after_cancel():
    called = Event()
    controller = CancellationController()
    controller.cancel_now()
    controller.register(called.set)

    assert called.wait(1)
