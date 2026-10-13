//! macOS handler for `shadowinfection-launcher://`.
//!
//! The development bundle and the installed app share one scheme. Whichever
//! build is the default handler is the one Launch Services opens.

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};

use crate::auth::google::DEEP_LINK_SCHEME;

pub fn claim(bundle_id: &str) -> bool {
    set_default_handler(DEEP_LINK_SCHEME, bundle_id)
}

fn set_default_handler(scheme: &str, bundle_id: &str) -> bool {
    let Ok(scheme) = CString::new(scheme) else {
        return false;
    };
    let Ok(bundle_id) = CString::new(bundle_id) else {
        return false;
    };

    unsafe {
        let scheme = cf_string(&scheme);
        let bundle_id = cf_string(&bundle_id);
        if scheme.0.is_null() || bundle_id.0.is_null() {
            return false;
        }
        LSSetDefaultHandlerForURLScheme(scheme.0, bundle_id.0) == 0
    }
}

struct CfString(*const c_void);

impl Drop for CfString {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}

unsafe fn cf_string(value: &CStr) -> CfString {
    CfString(CFStringCreateWithCString(
        std::ptr::null(),
        value.as_ptr(),
        CF_STRING_ENCODING_UTF8,
    ))
}

const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFStringCreateWithCString(
        alloc: *const c_void,
        c_str: *const c_char,
        encoding: u32,
    ) -> *const c_void;
    fn CFRelease(cf: *const c_void);
}

#[link(name = "CoreServices", kind = "framework")]
unsafe extern "C" {
    fn LSSetDefaultHandlerForURLScheme(
        in_url_scheme: *const c_void,
        in_handler_bundle_id: *const c_void,
    ) -> i32;
}
