## 0x01 System

五层：Kernel(Binder)、HAL、Runtime(ART)+Libs(Libc)、Framework(Java API)、APP

ART: 不同于Dalvik每次运行程序，字节码需要转换为机器码(dex2opt优化)。ART在应用程序安装时进行一次预编译(dex2oat)，将dex转为机器码存储。导致占据存储空间大以及安装时间长


## 0x02 ADB

https://developer.android.com/studio/command-line/adb


#### 1. 列举安装包

➜  ~ adb shell pm list packages 
package:com.google.android.networkstack.tethering
package:com.google.android.carriersetup
package:com.android.cts.priv.ctsshim
package:com.google.android.youtube
package:com.vzw.apnlib
package:com.android.internal.display.cutout.emulation.corner
package:com.google.android.ext.services
package:com.android.internal.display.cutout.emulation.double
package:asvid.github.io.fridaapp
package:com.android.providers.telephony

#### 2. 查看包信息  

➜  ~ adb shell dumpsys package com.google.android.tts
Activity Resolver Table:
  Non-Data Actions:
      android.speech.tts.engine.GET_SAMPLE_TEXT:
        602df77 com.google.android.tts/com.google.android.apps.speech.tts.googletts.settings.GetSampleText filter c5997e4
          Action: "android.speech.tts.engine.GET_SAMPLE_TEXT"
          Category: "android.intent.category.DEFAULT"

Receiver Resolver Table
      com.google.android.gms.phenotype.UPDATE:
        6e0466f com.google.android.tts/com.google.android.libraries.phenotype.client.stable.PhenotypeUpdateBackgroundBroadcastReceiver filter bcdff7c
          Action: "com.google.android.gms.phenotype.UPDATE"

Service Resolver Table:
      android.intent.action.TTS_SERVICE:
        4157c7b com.google.android.tts/com.google.android.apps.speech.tts.googletts.service.GoogleTTSService filter b35aa98
          Action: "android.intent.action.TTS_SERVICE"
          Category: "android.intent.category.DEFAULT"
          mPriority=100, mOrder=0, mHasStaticPartialTypes=false, mHasDynamicPartialTypes=false

Registered ContentProviders:
  com.google.android.tts/com.android.car.ui.core.SearchResultsProvider:
    Provider{4317672 com.google.android.tts/com.android.car.ui.core.SearchResultsProvider}
  com.google.android.tts/com.android.car.ui.core.CarUiInstaller:
    Provider{9525ac3 com.google.android.tts/com.android.car.ui.core.CarUiInstaller}

ContentProvider Authorities:
  [com.google.android.tts.CarUiInstaller]:
    Provider{9525ac3 com.google.android.tts/com.android.car.ui.core.CarUiInstaller}
      applicationInfo=ApplicationInfo{58a3f40 com.google.android.tts}
  [com.google.android.tts.SearchResultsProvider]:
    Provider{4317672 com.google.android.tts/com.android.car.ui.core.SearchResultsProvider}
      applicationInfo=ApplicationInfo{6a29e79 com.google.android.tts}

Key Set Manager:
  [com.google.android.tts]
      Signing KeySets: 6

Packages:
  Package [com.google.android.tts] (a1c87be):
    userId=10160
    pkg=Package{a75e01f com.google.android.tts}
    codePath=/data/app/~~eUXSng0g71JoE-Rr7i1lrw==/com.google.android.tts-i2jnU0XZ7bzFyEKexa9dJA==
    resourcePath=/data/app/~~eUXSng0g71JoE-Rr7i1lrw==/com.google.android.tts-i2jnU0XZ7bzFyEKexa9dJA==

Hidden system packages:
  Package [com.google.android.tts] (8a5a935):
    userId=10160
    pkg=Package{c1561ca com.google.android.tts}
    codePath=/system/product/app/GoogleTTS
    resourcePath=/system/product/app/GoogleTTS

Queries:
  system apps queryable: false
  forceQueryable:
    com.google.android.tts
  queries via package name:
  queries via intent:
  queryable via interaction:
    User 0:
      [com.android.inputdevices,com.qualcomm.qti.uceShimService,com.android.keychain,android,com.quicinc.cne.CNEService,com.google.SSRestartDetector,com.android.localtransport,com.android.settings,com.android.providers.settings,com.android.dynsystem,com.android.wallpaperbackup,com.android.server.telecom,com.android.location.fused]:
        com.google.android.tts
      [com.google.android.gsf,com.google.android.gms]:
        com.google.android.tts

Dexopt state:
  [com.google.android.tts]
    path: /data/app/~~eUXSng0g71JoE-Rr7i1lrw==/com.google.android.tts-i2jnU0XZ7bzFyEKexa9dJA==/base.apk
      arm64: [status=speed-profile] [reason=install-dm]

#### 3. 查看包的数据库信息  

➜  ~ adb shell dumpsys dbinfo com.android.settings

Connection pool for /data/user_de/0/com.android.settings/databases/homepage_cards.db:
  Open: true
  Max connections: 1
  Total execution time: 36
  Configuration: openFlags=268435456, isLegacyCompatibilityWalEnabled=false, journalMode=, syncMode=
  Available primary connection:
    Connection #0:
      isPrimaryConnection: true
      onlyAllowReadOnlyOperations: false
      Most recently executed operations:
        0: [2021-10-26 22:50:27.305] execute took 15ms - succeeded, sql="COMMIT;", path=/data/user_de/0/com.android.settings/databases/homepage_cards.db
        1: [2021-10-26 22:50:27.304] executeForLastInsertedRowId took 0ms - succeeded, sql="INSERT INTO cards(package_name,app_version,slice_uri,name,type,category,score) VALUES (?,?,?,?,?,?,?)", path=/data/user_de/0/com.android.settings/databases/homepage_cards.db
        2: [2021-10-26 22:50:27.304] prepare took 0ms - succeeded, sql="INSERT INTO cards(package_name,app_version,slice_uri,name,type,category,score) VALUES (?,?,?,?,?,?,?)", path=/data/user_de/0/com.android.settings/databases/homepage_cards.db


Database files in /data/user_de/0/com.android.settings/databases:
  battery_settings.db                        28672b ctime=2020-10-13T11:40:15Z mtime=2020-10-13T11:40:15Z atime=2020-08-21T19:24:46Z


#### 4. 查看处于前台的Activity

➜  ~ adb shell dumpsys activity top

TASK 1000:com.android.settings.root id=114 userId=0
  ACTIVITY com.android.settings/.Settings 73f04b2 pid=6724
    Local Activity cfa98a8 State:


    View Hierarchy:
      DecorView@68495cc[Settings]
        android.widget.LinearLayout{7cdd264 V.E...... ........ 0,0-1080,1920}
          android.view.ViewStub{f0db5c4 G.E...... ......I. 0,0-0,0 #10201af android:id/action_mode_bar_stub}
          android.widget.FrameLayout{31173f7 V.E...... ........ 0,0-1080,1920 #1020002 android:id/content}
            androidx.coordinatorlayout.widget.CoordinatorLayout{74d23f6 V.ED..... ........ 0,0-1080,1920 #7f0e0444 app:id/settings_homepage_container}
              androidx.core.widget.NestedScrollView{5723f2a VFED..... ........ 0,231-1080,2130 #7f0e02e6 app:id/main_content_scrollable_container}
                android.widget.LinearLayout{499c1d2 VFE...... .F...... 0,0-1080,4264 #7f0e0264 app:id/homepage_container aid=1073741824}


看起来还有View的层级显示

#### 5. 调试  


255|walleye:/ # am help
Activity manager (activity) commands:
  help
      Print this help text.
  start-activity [-D] [-N] [-W] [-P <FILE>] [--start-profiler <FILE>]
          [--sampling INTERVAL] [--streaming] [-R COUNT] [-S]
          [--track-allocation] [--user <USER_ID> | current] <INTENT>
      Start an Activity.  Options are:
      -D: enable debugging
      -N: enable native debugging


➜  ~ adb shell am start-activity -D -N com.termux/.app.TermuxActivity
Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] cmp=com.termux/.app.TermuxActivity }


<INTENT> specifications include these flags and arguments:
    [-a <ACTION>] [-d <DATA_URI>] [-t <MIME_TYPE>] [-i <IDENTIFIER>]
    [-c <CATEGORY> [-c <CATEGORY>] ...]
    [-n <COMPONENT_NAME>]


adb shell screencap -p /data/local/tmp/sp.png

adb shell input text "hello"


getprop

