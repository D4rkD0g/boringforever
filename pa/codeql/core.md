version: codeqlcli 2.5.9
env: macOS

codeql为bash脚本，最后

```bash
exec "${CODEQL_JAVA_HOME}/bin/java" \
    $jvmArgs \
    --add-modules jdk.unsupported \
    -cp "$CODEQL_DIST/tools/codeql.jar" \
    "com.semmle.cli2.CodeQL" "$@"
```

直接jd-gui得到源码，加载进IDEA，然后run->Edit Configurations->new->Remote JVM Debug。下断点。

终端执行
`java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005 --add-modules jdk.unsupported -cp tools/codeql.jar "com.semmle.cli2.CodeQL" "--version"`

然后IDEA调试，即可停在断点处

入口com.semmle.cli2.CodeQL，但runMain在cli2.picocli.SubcommandMaker中