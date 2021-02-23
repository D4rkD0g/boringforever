
## 0x00 CodeQL

CodeQL，可能前年的时候，就想看看。但是，觉得Bin才是王道，哪有那么多有源码的  

## 0x01 xnu爱上了CodeQL

大部分codeql的教程都基于vscode，但是vscode吃硬盘太多，微软给了[docker](https://github.com/microsoft/codeql-container)，但是我还是选择直接[codeql-cli](https://github.com/github/codeql-cli-binaries/releases)

生怕我学不会，给了个codeql分析xnu的例子[Using QL snapshots for analysis of large open source projects](https://blog.semmle.com/open-source-projects-ql-snapshots/)，并且贴心的提供了一些xnu的[snapshot](https://semmle.com/large-oss-projects)，但是版本比较旧，还在10.14.3

恰巧这几天xnu出了11.0.1，并且有大佬给出了新的编译步骤[Building XNU for macOS Big Sur 11.0.1 (Intel)](https://kernelshaman.blogspot.com/2021/01/building-xnu-for-macos-big-sur-1101.html)，所以就试试新版本xnu吧（这个大佬的博客就是介绍各种XNU编译的）

```bash
curl https://jeremya.com/sw/Makefile.xnudeps > Makefile.xnudeps
make -f Makefile.xnudeps
cd xnu-7195.50.7.100.1
make SDKROOT=macosx ARCH_CONFIGS=X86_64 KERNEL_CONFIGS=RELEASE
```

四步走，爽歪歪。可能需要注意的是在make时，用到的是python2。。。

直接在xnu源码目录中`codeql database create xnu-database --language=cpp --command="make SDKROOT=macosx ARCH_CONFIGS=X86_64 KERNEL_CONFIGS=RELEASE"`就可以生成xnu-database数据库
codeql和文件夹目录层级有很大关系，codeqlcli存放的就是codeql二进制程序，codeql-repo放的是一些qlpack？具体内容没有深究，毕竟首先是实现codeql跑xnu

```bash
➜  codeql tree -L 1
.
├── codeql-repo
├── codeqlcli
└── xnu-database
```

直接跑一下上边教程的样例`➜  codeqlcli codeql database analyze  ../xnu-database ../codeql-repo/cpp/ql/src/loop.ql  --format=sarif-latest -o 1.sarif-latest`：

```ql
/**
 * @name Infinite loop
 * @description Updating a loop index with a compound assignment
 *              could cause non-termination.
 * @kind problem
 * @problem.severity warning
 * @id apple-xnu/cpp/infinite-loop
 */

import cpp
import semmle.code.cpp.rangeanalysis.SimpleRangeAnalysis

// Find loops like this:
// while (x) { ...; x -= n; }
from Loop loop, Variable v, AssignArithmeticOperation assign
where
  (
    loop.getCondition() = v.getAnAccess() or
    loop.getCondition().(ComparisonOperation).getAnOperand() = v.getAnAccess()
  ) and
  assign.getLValue() = v.getAnAccess() and  //限定是对对变量赋值的语句
  // Compound assignment is in the body of the loop:
  assign = loop.getStmt().getAChild*() and //限定赋值在循环中
  lowerBound(assign.getRValue()) <= 0 and  //预测表达式中常量的边界
  upperBound(assign.getRValue()) >= 0
select loop, "Loop might not terminate due to this $@.", assign, "assignment"
```

因为这篇不是介绍codeql的文章，所以暂时省略用法、原理什么的介绍，再说了，我也不会。。。
把以上的代码保存在了codeql-repo的相关目录下，可能没有vscode的话，会有一些繁琐的事情要做，但是不用在意。。。就先这样保存吧
ql文件前边的注释是[metadata](https://codeql.github.com/docs/writing-codeql-queries/metadata-for-codeql-queries/)，其中有个kind字段，在codeql analyze的时候会被要求，用来表明如何编译与显示查询结果，可以是“problem”或者“path-problem”。指定这些就很麻烦，等下有一个等效的方法
ql中查询类似循环赋值语句，from中选择所有循环、变量以及赋值操作，where中设置条件，筛选循环condition中出现并且body中被赋值的loop，结果片段如下

```json
{
      "ruleId" : "apple-xnu/cpp/infinite-loop",
      "ruleIndex" : 0,
      "message" : {
        "text" : "Loop might not terminate due to this [assignment](1)."
      },
      "locations" : [ {
        "physicalLocation" : {
          "artifactLocation" : {
            "uri" : "bsd/dev/dtrace/dtrace.c",
            "uriBaseId" : "%SRCROOT%",
            "index" : 0
          },
          "region" : {
            "startLine" : 2943,
            "startColumn" : 2,
            "endLine" : 2962,
            "endColumn" : 3
          }
        }
      } ],
      "partialFingerprints" : {
        "primaryLocationLineHash" : "902467ca9469ef9:1",
        "primaryLocationStartColumnFingerprint" : "0"
      },
      "relatedLocations" : [ {
        "id" : 1,
        "physicalLocation" : {
          "artifactLocation" : {
            "uri" : "bsd/dev/dtrace/dtrace.c",
            "uriBaseId" : "%SRCROOT%",
            "index" : 0
          },
          "region" : {
            "startLine" : 2961,
            "startColumn" : 3,
            "endColumn" : 16
          }
        },
        "message" : {
          "text" : "assignment"
        }
      } ]
    }
```
可以对应源码看一下

```c
➜  dtrace bat -r "2943:2962" dtrace.c
───────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       │ File: dtrace.c
───────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
2943   │     while (saddr < slimit) {
2944   │         size_t size;
2945   │         dtrace_rechdr_t *dtrh = (dtrace_rechdr_t *)saddr;
2946   │
2947   │         if (dtrh->dtrh_epid == DTRACE_EPIDNONE) {
2948   │             saddr += sizeof (dtrace_epid_t);
2949   │             continue;
2950   │         }
2951   │
2952   │         ASSERT(dtrh->dtrh_epid <= ((dtrace_epid_t) state->dts_necbs));
2953   │         size = state->dts_ecbs[dtrh->dtrh_epid - 1]->dte_size;
2954   │
2955   │         ASSERT(saddr + size <= slimit);
2956   │         ASSERT(size >= sizeof(dtrace_rechdr_t));
2957   │         ASSERT(DTRACE_RECORD_LOAD_TIMESTAMP(dtrh) == UINT64_MAX);
2958   │
2959   │         DTRACE_RECORD_STORE_TIMESTAMP(dtrh, timestamp);
2960   │
2961   │         saddr += size;
2962   │     }
```

循环被筛选出来并且2961行的赋值操作也被指明了，但是2948行不算么，应该是sizeof不满足检测条件
其实以上的功能LLVM或者其他框架也可以做，但是codeql太方便了，直接编译直接查询

另外一个是检测off-by-one漏洞的，这个就有点东西了

```sql
/**
 * @name Off-by-one error
 * @description An off-by-one error could happen.
 * @kind problem
 * @problem.severity warning
 * @id linux/cpp/off-by-one-error
 */
 
import cpp
import semmle.code.cpp.controlflow.Guards
import semmle.code.cpp.dataflow.TaintTracking

from
  DataFlow::Node source, DataFlow::Node check, GTExpr guard, DataFlow::Node index, ArrayExpr array
where
  // The values coming from `source` are checked at `check`.
  DataFlow::localFlow(source, check) and
  // `check` is the "greater" operand of the `>` comparison `guard`.
  check.asExpr() = guard.getGreaterOperand() and
  // A value derived from `source` is used at `index`.
  TaintTracking::localTaint(source, index) and
  // `index` is the index in an array expression.
  index.asExpr() = array.getArrayOffset() and
  // `index` only executes if `guard` is false.
  guard.(GuardCondition).controls(index.asExpr().getBasicBlock(), false) and
  // Focus on vulnerable results: Only report if the `guard` comparison
  // establishes a lower bound which is too large for the size of the array.
  guard.getLesserOperand().getValue().toInt() >= array
        .getArrayBase()
        .getType()
        .getUnspecifiedType()
        .(ArrayType)
        .getArraySize()
select source, check, index, array.getArrayBase().getType().getUnspecifiedType()
```

用到了控制流以及数据流，超越了我目前知识的范畴，毕竟文档还没有看完，不过不重要  

（two weeks later）

本以为这个串串也就两个漏洞，结果最开始的漏洞要追溯到2017年了

## 0x01 CVE-2017-13904 & CVE-2018-4249

两个CVE都在macOS High Sierra 10.13.5中被修复  
以有问题的内核版本xnu-4570.1.46为例，漏洞代码位置在`bsd/net/packet_mangler.c`，不过packet-mangler这个功能并不是默认开启的吧   

```c
static errno_t pktmnglr_ipfilter_input(void *cookie, mbuf_t *data, int offset, u_int8_t protocol)
{
  struct packet_mangler *p_pkt_mnglr = (struct packet_mangler *)cookie;
  struct ip ip;
  struct tcphdr tcp;
  char tcp_opt_buf[TCP_MAX_OPTLEN] = {0};
  int orig_tcp_optlen;

  /* Check for IP filter options */
  error = mbuf_copydata(*data, 0, sizeof(ip), &ip);
  if (error) {
    PKT_MNGLR_LOG(LOG_ERR, "Could not make local IP header copy");
    goto input_done;
  }

  switch (protocol) {
    case IPPROTO_TCP:
      error = mbuf_copydata(*data, offset, sizeof(tcp), &tcp);
      if (error) {
        PKT_MNGLR_LOG(LOG_ERR, "Could not make local TCP header copy");
        goto input_done;
      }
    ...
  }

  /* Protocol actions */
  switch (protocol) {
    case IPPROTO_TCP:
      if (p_pkt_mnglr->proto_action_mask) {
        int i = 0;
        tcp_optlen = (tcp.th_off << 2)-sizeof(struct tcphdr);
        orig_tcp_optlen = tcp_optlen;
        if (orig_tcp_optlen) {
          error = mbuf_copydata(*data, offset+sizeof(struct tcphdr), orig_tcp_optlen, tcp_opt_buf);
          if (error) {
            PKT_MNGLR_LOG(LOG_ERR, "Failed to copy tcp options");
            goto input_done;
          }
        }
        while (tcp_optlen) {
          if (tcp_opt_buf[i] == 0x1) {
            tcp_optlen--;
            i++;
            continue;
          } else if ((tcp_opt_buf[i] != 0) && (tcp_opt_buf[i] != TCP_OPT_MULTIPATH_TCP)) {
            tcp_optlen -= tcp_opt_buf[i+1];
            i += tcp_opt_buf[i+1];
            continue;
          } else if (tcp_opt_buf[i] == TCP_OPT_MULTIPATH_TCP) {
            int j = 0;
            int mptcpoptlen = tcp_opt_buf[i+1];
            tcp_optlen -= mptcpoptlen;
            i += mptcpoptlen;
          } else {
            tcp_optlen--;
            i++;
          }
        }
    ...
  }
```

热乎的[poc](https://github.com/Semmle/SecurityExploits/blob/master/apple/darwin-xnu/packet_mangler_CVE-2017-13904/cve-2017-13904-poc.c)，这个semmle的仓库里都是CodeQL的手下败将  

CVE-2017-13904是一个无限循环，在while语句这个片段中，当tcp_optlen不为零的时候一直处理下去，其中有两个自减，以及两个重新赋值，有问题的便是这重新赋值。else if中涉及的都是tcp_opt_buf得值，这个值都是通过mbuf_copydata，把data中接收到的数据包，指定offset与length，复制到tcp_opt_buf，这个过程没什么检查，因此攻击者完全可控。else if语句中判断tcp_opt_buf[i]的值来操作tcp_opt_buf[i+1]，如果此时tcp_opt_buf[i+1]为零，那么tcp_optlen与i就都不会有变化，那么就会无限循环了。。。  
这个洞这么明显的么？只是漏洞代码所在的功能应该怎么启动，文章最开始说用`netstat | grep packet-mangler`来检测，但是11.1什么都没有出来。不过文章最后还是给了复现方法，但是在11.1上还是不行。。。  

```bash
curl https://opensource.apple.com/source/network_cmds/network_cmds-543/pktmnglr/packet_mangler.c -O
curl https://opensource.apple.com/source/xnu/xnu-4570.41.2/bsd/net/packet_mangler.h -O
#  change #include <net/packet_mangler.h>
#  to
#  #define PRIVATE
#  #include "packet_mangler.h"

cc packet_mangler.c
sudo ./a.out -p tcp -M 1
```

言归正传，再来看一下缓冲区溢出的问题，刚提到了mbuf_copydata，其中的长度orig_tcp_optlen就是tcp_optlen，而这个值通过`(tcp.th_off << 2)-sizeof(struct tcphdr);`获取，而tcp这个数据就是从data中得到的`mbuf_copydata(*data, offset, sizeof(tcp), &tcp);`。  
如果tcp.th_off为零，那么orig_tcp_optlen就是负值，此时再mbuf_copydata获取tcp_opt_buf的时候，负值整形溢出变为可能很大的正数，便会溢出。其实mbuf_copydata在kpi_mbuf.c中实现的代码有`count = m->m_len - off > len ? len : m->m_len - off;`判断复制的长度，可以越界写，但是有那么大长度覆盖返回地址么？而且mbuf_copydata应该是正常返回，而不是文章中说的异常返回吧？  
两个漏洞的根本原因在于用户可控的数据，fuzz的话感觉比较容易的测到。CodeQL多用于漏洞变种检测，根据漏洞成因，形成检测规则，在代码库中查找相似的片段。  

```ql
import cpp
import semmle.code.cpp.rangeanalysis.SimpleRangeAnalysis

// Find an assignment like this:  x[i+j] = v
from ArrayExpr ae, BinaryArithmeticOperation idx, Assignment assign
where ae = assign.getLValue()
  and idx = ae.getArrayOffset()
  and convertedExprMightOverflow(idx)
select idx, "Array index might overflow"
```

作者首先写了这个，用来检测数组赋值中的下标是否可能溢出。
另外作者写的Infinite loop，就是本篇最开始提到的那个QL  

## 0x02 CVE-2018-4407-Kernel crash caused by out-of-bounds write in Apple's ICMP packet-handling code

> Kernel Available for: macOS Sierra 10.12.6, macOS High Sierra 10.13.6
> Impact: An attacker in a privileged network position may be able to execute arbitrary code
> Description: A memory corruption issue was addressed with improved validation.
> CVE-2018-4407: Kevin Backhouse of Semmle Ltd.

作者发现的这个漏洞是受0x01中的启发，然后写了个ql，查询控制流：从m_mtod到copydata函数簇的第三个参数，也就是长度  

```ql
/**
 * @name mbuf copydata with tainted size
 * @description Calling m_copydata with an untrusted size argument
 *              could cause a buffer overflow.
 * @kind path-problem
 * @problem.severity warning
 * @id apple-xnu/cpp/mbuf-copydata-with-tainted-size
 */

import cpp
import semmle.code.cpp.dataflow.TaintTracking
import DataFlow::PathGraph

class Config extends TaintTracking::Configuration {
  Config() { this = "tcphdr_flow" }

  override predicate isSource(DataFlow::Node source) {
    source.asExpr().(FunctionCall).getTarget().getName() = "m_mtod"
  }

  override predicate isSink(DataFlow::Node sink) {
    exists (FunctionCall call
    | call.getArgument(2) = sink.asExpr() and
      call.getTarget().getName().matches("%copydata"))
  }
}

from Config cfg, DataFlow::PathNode source, DataFlow::PathNode sink
where cfg.hasFlowPath(source, sink)
select sink, source, sink, "m_copydata with tainted size."
```

查询返回9个结果，其中一个就是这个漏洞，其他8个误报，所以看起来还挺令人满意的；然而我在10.13.5上跑了一下，结果可不止9个，为什么🙄️  

这个漏洞挺好玩的，当年舍友在宿舍吃鸡声音太大，直接发包让他手机各种重启。。。  
这个漏洞说是XNU的一个越界写，但是Ian Beer说这个不大可能导致RCE  

一个好用的[poc](https://github.com/r3dxpl0it/CVE-2018-4407)，其中就是发了一个包`send(IP(src=src, dst=host, options=[IPOption(“A”*8)])/TCP(options=[(19,"x"*18),(19,"x"*18)]), verbose=False)`  

作者给了c的[poc](https://github.com/Semmle/SecurityExploits/blob/master/apple/darwin-xnu/icmp_error_CVE-2018-4407/send_packet.c)，其中可以看到漏洞的函数调用流程  

```
// Create and send a TCP packet, which triggers the following callpath:
//
// 1. ip_input()                bsd/netinet/ip_input.c:1835
// 2. call to ip_dooptions()    bsd/netinet/ip_input.c:2185
// 3. ip_dooptions()            bsd/netinet/ip_input.c:3222
// 4. goto bad                  bsd/netinet/ip_input.c:3250
// 5. call icmp_error           bsd/netinet/ip_input.c:3495
// 6. icmp_error()              bsd/netinet/ip_icmp.c:203
// 7. call m_copydata()         bsd/netinet/ip_icmp.c:339
```

作者用的xnu-4570.1.46来进行分析，漏洞代码在`/bsd/netinet/ip_icmp.c`  

既然是ICMP，先介绍一下，ICMP大致分成两种功能：差错通知和信息查询。差错通知是指接受者处理数据包的过程中，发生错误后会通过ICMP返回给发送者错误原因等消息；信息查询主要就是对发送者的问题回答  
这个漏洞出现在差错通知的代码中  

```c
#define MH_ALIGN(m, len)                                  \
do {                                                      \
  (m)->m_data += (MHLEN - (len)) &~ (sizeof (long) - 1);  \
} while (0)

//mtod(m,t) -  convert mbuf pointer to data pointer of correct type
#define mtod(m, t)      ((t)m_mtod(m))
#define MTOD(m, t)      ((t)((m)->m_data))
/*
 * Generate an error packet of type error
 * in response to bad packet ip.
 */
void
icmp_error(struct mbuf *n, int type, int code, u_int32_t dest, u_int32_t nextmtu) {
  u_int32_t oiphlen, icmplen, icmpelen, nlen;

  oip = mtod(n, struct ip *);
  #define IP_VHL_HL(vhl)          ((vhl) & 0x0f)
  oiphlen = IP_VHL_HL(oip->ip_vhl) << 2;
  //TCP分支
  icmpelen = max(tcphlen, min(icmp_datalen, (oip->ip_len - oiphlen)));
  icmplen = min(oiphlen + icmpelen, min(nlen, oip->ip_len));
  if (icmplen < sizeof(struct ip))
    goto freeit;
  /*
   * First, formulate icmp message
   */
  if (MHLEN > (sizeof(struct ip) + ICMP_MINLEN + icmplen))
    m = m_gethdr(M_DONTWAIT, MT_HEADER);  /* MAC-OK */
  else
    m = m_getcl(M_DONTWAIT, MT_DATA, M_PKTHDR);

  #define ICMP_MINLEN   8    /* abs minimum */
  m->m_len = icmplen + ICMP_MINLEN; /* for ICMP header and data */
  MH_ALIGN(m, m->m_len);
  icp = mtod(m, struct icmp *);
  if ((u_int)type > ICMP_MAXTYPE) {
    m_freem(m);
    goto freeit;
  }
  icmpstat.icps_outhist[type]++;
  icp->icmp_type = type;

  m_copydata(n, 0, icmplen, (caddr_t)&icp->icmp_ip);

}
```

接收者差错通知的时候，会将出错的包头拿出来扔到返回的icmp报文中，也就是m_copydata所做的事情  
n是原始的输入数据，icp根据m转换得来，那么要么是icmplen有问题，要么是icp->icmp_ip有问题  
现在看`MH_ALIGN(m, m->m_len);`，宏定义len为icmplen+8，MHLEN经过以下的定义说是88

```c
#define MSIZESHIFT      8                       /* 256 */
#define MSIZE           (1 << MSIZESHIFT)       /* size of an mbuf */
#define _MLEN           (MSIZE - sizeof(struct m_hdr))  /* normal data len */
#define _MHLEN          (_MLEN - sizeof(struct pkthdr)) /* data len w/pkthdr */
```

> The value of MHLEN is 88, so if icmplen > 80 then a negative integer overflow happens and m->m_data is incremented by just under 4GB. This means that icp gets assigned a bogus data pointer on the next line and the assignment to icp->icmp_type causes an out-of-bounds write.

```
  (m)->m_data += (88 - (icmplen+8)) & 0xfffffff8
  =>
  (m)->m_data += (80 - icmplen) & 0xfffffff8
```

???这是说`icp->icmp_type = type;`导致的越界写？什么玩意，感觉作者自己都很迷。。。  

再来看看大哥们的[CVE-2018-4407 XNU内核漏洞详细分析](https://www.anquanke.com/post/id/163716)

poc中构造了畸形的IP包(其中的options数据不合法)，bsd\netinet\ip_input.c:ip_dooptions函数负责处理这部分数据，失败后就会执行icmp_error，好，连接上了最开始提到的内容  
再看m_copydata函数，其中的长度相关的语句

```c

struct ip {
  u_char  ip_vhl;                 /* version << 4 | header length >> 2 */
  ...
}

oip = mtod(n, struct ip *);
#define IP_VHL_HL(vhl)          ((vhl) & 0x0f)
//oiphlen是ip头与ipoptions之和即28字节（布吉岛原因）
oiphlen = IP_VHL_HL(oip->ip_vhl) << 2;


th = (struct tcphdr *)(void *)((caddr_t)oip + oiphlen);
tcphlen = th->th_off << 2;
const static int icmp_datalen = 8;
//操作完后icmpelen=60
icmpelen = max(tcphlen/*长度60*/, min(icmp_datalen/*长度8*/, (oip->ip_len - oiphlen)));

//unsigned int m_length(struct mbuf *m) Return the number of bytes in the mbuf chain, m.
nlen = m_length(n); //原始packet的长度,大于oip->ip_len=88
//操作完后icmplen=88
icmplen = min(oiphlen + icmpelen, min(nlen, oip->ip_len));

#define ICMP_MINLEN   8    /* abs minimum */
if (MHLEN > (sizeof(struct ip) + ICMP_MINLEN + icmplen))
    m = m_gethdr(M_DONTWAIT, MT_HEADER);  /* MAC-OK */
  else
    m = m_getcl(M_DONTWAIT, MT_DATA, M_PKTHDR);

m->m_len = icmplen + ICMP_MINLEN; /* for ICMP header and data */
MH_ALIGN(m, m->m_len);
icp = mtod(m, struct icmp *);

m_copydata(n, 0, icmplen, (caddr_t)&icp->icmp_ip);

```

icmplen确定完是88，接下来看icp。icp由m得到，所以有涉及到一个分支的操作。大哥嫌源码判断结构体大小太麻烦，动态内核调试了一波，确定MHLEN=0x57=87（原英文作者怎么说是88。。。)那肯定走m_getcl  

```c

//mbuf.h
/* header at beginning of each mbuf: */
struct m_hdr {
  struct mbuf     *mh_next;       /* next buffer in chain */
  struct mbuf     *mh_nextpkt;    /* next chain in queue/record */
  caddr_t         mh_data;        /* location of data */
  int32_t         mh_len;         /* amount of data in this mbuf */
  u_int16_t       mh_type;        /* type of data in this mbuf */
  u_int16_t       mh_flags;       /* flags; see below */
}

/*
 * The mbuf object
 */
struct mbuf {
  struct m_hdr m_hdr;
  union {
    struct {
      struct pkthdr MH_pkthdr;        /* M_PKTHDR set */
      union {
        struct m_ext MH_ext;    /* M_EXT set */
        char    MH_databuf[_MHLEN];
      } MH_dat;
    } MH;
    char    M_databuf[_MLEN];               /* !M_PKTHDR, !M_EXT */
  } M_dat;
};

#define m_data          m_hdr.mh_data
#define m_pktdat        M_dat.MH.MH_dat.MH_databuf

#define MBUF_INIT(m, pkthdr, type) {                                    \
  _MCHECK(m);                                                     \
  (m)->m_next = (m)->m_nextpkt = NULL;                            \
  (m)->m_len = 0;                                                 \
  (m)->m_type = type;                                             \
  if ((pkthdr) == 0) {                                            \
          (m)->m_data = (m)->m_dat;                               \
          (m)->m_flags = 0;                                       \
  } else {                                                        \
          (m)->m_data = (m)->m_pktdat;                            \
          (m)->m_flags = M_PKTHDR;                                \
          MBUF_INIT_PKTHDR(m);                                    \
  }                                                               \
}

//uipc_mbuf.c
/*
 * Perform `fast' allocation mbuf clusters from a cache of recently-freed
 * clusters. (If the cache is empty, new clusters are allocated en-masse.)
 */

struct mbuf *
m_getcl(int wait, int type, int flags)
{
  struct mbuf *m;
  int mcflags = MSLEEPF(wait);
  int hdr = (flags & M_PKTHDR);

  m = mcache_alloc(m_cache(MC_MBUF_CL), mcflags);
  MBUF_INIT(m, hdr, type);
}
```

从下往上看，MBUF_INIT宏进行初始化，m_data被赋值为m_pktdat，结合mbuf结构体，其中缓冲区大小为_MHLEN=87  
现在`icp = mtod(m, struct icmp *)`之后，icp指向m->data，m->data指向大小为87的缓冲区。但MH_ALIGN(m, m->m_len)不是会调节data的大小么。。。emmmm中英用的poc不同，影响也不同？？？  
最后icp虽然指向data，但是icp->icmp_ip会发生偏移（icp->icmp_ip其实等于&m->m_data[7]，但我不知道为什么），icmplen=88,icp->icmp_ip指向的空间还剩余87-8=79，所以就溢出了  
还是好迷，这个英文作者写的ql有什么联系？mtod和copydata中的len长度字段没什么关系吧？？？

## 0x02.5 CVE-2018-4407 ICMP proof of concept

上篇的作者其实还有一个续（我讨厌这个作者，有点装B的嫌疑）  
这篇文章主要讲了CodeQL的用法，还不错  

```ql
/**
 * @name Paths to icmp_error
 * @description Find data-flow paths that lead to the first parameter of icmp_error.
 * @kind path-problem
 * @problem.severity warning
 */

import cpp
import semmle.code.cpp.dataflow.DataFlow
import DataFlow::PathGraph

class Config extends DataFlow::Configuration {
  Config() { this = "tcphdr_flow" }

  override predicate isSource(DataFlow::Node source) {
    exists (source.asExpr())
  }

  override predicate isSink(DataFlow::Node sink) {
    // The sink is the zero'th parameter of `icmp_error`: `struct mbuf *n`.
    exists (Parameter p
    | p = sink.asParameter() and
      p.getFunction().getName() = "icmp_error" and
      p.getIndex() = 0)
  }
}

from Config cfg, DataFlow::PathNode source, DataFlow::PathNode sink
where cfg.hasFlowPath(source, sink)
select source, source, sink, "Expression flows to icmp_error."
```
描述里已经说明，查找达到icmp_error第一个参数的控制流，找到84个，其中有几个来自ip_input，这个函数主要处理输入的数据包。现在可以在上边ql的基础上加上`source.getFunction().getName() = "ip_input"`做一个限定，同时还可以设置barrier来排除经过函数ip_forward的控制流:

```
override predicate isBarrier(DataFlow::Node node) {
  node.getFunction().getName() = "ip_forward"
}
```

算了，也没什么好讲的

## 0x03 CVE-2020-9967 - Apple macOS 6LowPAN Vulnerability

作者受上一篇0x02的文章启发，在macOS 10.15.4中找了找  

```ql

import cpp
import semmle.code.cpp.dataflow.TaintTracking
import DataFlow::PathGraph
import semmle.code.cpp.rangeanalysis.SimpleRangeAnalysis

class Config extends TaintTracking::Configuration {
  Config() { this = "sixlowpan_flow" }

  override predicate isSource(DataFlow::Node source) {
    source.asExpr().(FunctionCall).getTarget().getName() = "m_mtod"
  }

  override predicate isSink(DataFlow::Node sink) {
    exists (FunctionCall call
    | call.getArgument(2) = sink.asExpr() and
      call.getTarget().getName() = "__builtin___memmove_chk" )
  }
}

from Config cfg, DataFlow::PathNode source, DataFlow::PathNode sink
where cfg.hasFlowPath(source, sink)
select sink, source, sink, "memmove with tainted size."
```

其实就是个污点，然后作者手动查看了一条数据流

```c
1 call to m_mtod  if_6lowpan.c:623:2
  memcpy(&len, mtod(m, u_int8_t *), sizeof(u_int16_t));
2 len   if_6lowpan.c:663:41
  frame802154_parse(mtod(mc, uint8_t *), len, &ieee02154hdr, &payload);
3 ref arg & ... [payload_len]   if_6lowpan.c:663:46
4 & ... [payload_len]   if_6lowpan.c:666:19
  sixxlowpan_input(&ieee02154hdr, payload);
5 ieee02154hdr [payload_len]  sixxlowpan.c:882:38
  sixxlowpan_input(struct frame802154 *ieee02154hdr, u_int8_t *payload)
6 ieee02154hdr [payload_len]  sixxlowpan.c:886:32
  error = sixxlowpan_uncompress(ieee02154hdr, payload);
7 ieee02154hdr [payload_len]  sixxlowpan.c:819:43
  sixxlowpan_uncompress(struct frame802154 *ieee02154hdr, u_int8_t *payload)
8 ieee02154hdr [payload_len]  sixxlowpan.c:855:7
  memmove(payload + hdrlen, payload + hdroffset, ieee02154hdr->payload_len - hdroffset);
9 payload_len   sixxlowpan.c:855:21
10  ... - ...   sixxlowpan.c:855:7
```

macOS Catalina 10.15引入了一个[6LowPAN](https://tools.ietf.org/html/rfc4919)，也就是“IPv6 over Low-Power Wireless Personal Area Networks”，对应内核版本xnu-6153.11.26，新功能当然就更有可能包含新问题  

> IEEE 802.15.4是一种技术标准，它定义了低速率无线个人局域网 （LR-WPAN）的协议。 它规定了LR-WPAN的物理层和媒体访问控制，6LowPAN提供了更上层的东西来进行扩展

源码中主要由三个相关文件：  
frame802154.c：802.15.4帧的创建与解析  
if_6lowpan.c：6LowPAN网络接口相关  
sixlowpan.c：6LowPAN压缩与解压缩  

作者说大部分代码其实来自[Contiki-NG: The OS for Next Generation IoT Devices](https://github.com/contiki-ng/contiki-ng)

协议确实容易出洞，但是我还是挺讨厌每种协议都深究格式含义的，所以我挖不到洞。。。  
由于一些原因，接收到的6LowPAN包是压缩的，数据链路层功能函数ether_demux会判断ether_type是否为IEEE 802.15.4，然后交给sixlowpan_input去解封装。

```c
struct frame802154 {
  /* The fields dest_addr and src_addr must come first to ensure they are aligned to the
   * CPU word size. Needed as they are accessed directly as linkaddr_t*. Note we cannot use
   * the type linkaddr_t directly here, as we always need 8 bytes, not LINKADDR_SIZE bytes. */
  uint8_t dest_addr[8];           /**< Destination address */
  uint8_t src_addr[8];            /**< Source address */
  frame802154_fcf_t fcf;          /**< Frame control field  */
  uint8_t seq;                    /**< Sequence number */
  uint16_t dest_pid;              /**< Destination PAN ID */
  uint16_t src_pid;               /**< Source PAN ID */
  frame802154_aux_hdr_t aux_hdr;  /**< Aux security header */
  //uint8_t *payload;               /**< Pointer to 802.15.4 payload */
  int payload_len;                /**< Length of payload field */
};
typedef struct frame802154 frame802154_t;

sixlowpan_input(ifnet_t p, __unused protocol_family_t protocol,
    mbuf_t m, __unused char *frame_header)
{
  frame802154_t      ieee02154hdr;
  u_int8_t           *payload = NULL;
  if6lpan_ref        ifl = NULL;
  bpf_packet_func    bpf_func;
  mbuf_t mc, m_temp;
  int off, err = 0;
  u_int16_t len;

//分配空间
  mc = m_getcl(M_WAITOK, MT_DATA, M_PKTHDR);
  if (mc == NULL) {
    err = -1;
    goto err_out;
  }
//用户可控的m，最终控制len
  memcpy(&len, mtod(m, u_int8_t *), sizeof(u_int16_t));
  len = ntohs(len);               
  m_adj(m, sizeof(u_int16_t));
//复制压缩的802.15.4帧到上边分配的空间mc
  for (m_temp = m, off = 0; m_temp != NULL; m_temp = m_temp->m_next) {
    if (m_temp->m_len > 0) {
      m_copyback(mc, off, m_temp->m_len, mtod(m_temp, void *));
      off += m_temp->m_len;
    }
  }

//解析802.15.4数据帧头部
  bzero(&ieee02154hdr, sizeof(ieee02154hdr));
  frame802154_parse(mtod(mc, uint8_t *), len, &ieee02154hdr, &payload);
  sixxlowpan_input(&ieee02154hdr, payload);
}
```
在frame802154_parse中，因为可以控制len，所以也就控制了pf->payload_len  

```c
frame802154_parse(uint8_t *data, int len, frame802154_t *pf, uint8_t **payload) {

  /* header length */
  c = p - data;
  /* payload length */
  pf->payload_len = (len - c); 
  /* payload */
  *payload = p;
}
```

继续sixxlowpan_input，调用sixxlowpan_uncompress  

```c
sixxlowpan_uncompress(struct frame802154 *ieee02154hdr, u_int8_t *payload)
{
  long hdroffset;
  size_t hdrlen;
  u_int8_t hdrbuf[128];
  errno_t error;

  bzero(hdrbuf, sizeof(hdrbuf));
  hdrlen = sizeof(hdrbuf);

  error = uncompress_hdr_hc1(ieee02154hdr, (u_int8_t *)payload,
      0, &hdroffset, &hdrlen, hdrbuf);

  if (error != 0) {
    return error;
  }

  if (hdroffset < 0) {
    memmove(&payload[0],
        &payload[hdrlen],
        ieee02154hdr->payload_len - hdrlen);
    ieee02154hdr->payload_len -= hdrlen;
  } else {
    memmove(payload + hdrlen,
        payload + hdroffset,
        ieee02154hdr->payload_len - hdroffset);
    memcpy(payload, hdrbuf, hdrlen);
    ieee02154hdr->payload_len += hdrlen - hdroffset;
  }

  return 0;
}
```

其中的uncompress_hdr_hc1中，TMD 不看了，不关心

## 0x04 乱七八糟

最开始LLVM做一些数据流分析，或者静态分析，pass写起来的话，代码肯定是比ql语句要多的  
更感觉像是漏洞模型匹配，而且静态分析的主要问题还是构造poc，所以CodeQL作为漏洞变体分析是不是还是需要借助已有poc的模版  
几个漏洞下来，觉得效果并没有想象中的好，而且很奇怪这些问题为什么fuzz没有发现  
而且并没有学到什么CodeQL知识，觉得应该想E语言再把语法包装一层，毕竟我笨  
就这样吧，有点没意思，可能虽然是苹果的洞，但还是常规类型，个人觉得iokit、port这些东西属于苹果的点  
在不同的领域挖掘同样的漏洞就很无聊，就像我现在做的  
而且最近状态不对，瞎忙，导致思考的时间很少  
酱，boring

## 0x05 Updates 

Update 0x01: 关于代码相似性检测    
2021-02-23  

代码相似性的问题已经被研究很久了，比如科恩的binary-ai等面向二进制的  
最近看到的是Usenix 2020中的[FICS](https://github.com/RiS3-Lab/FICS)，内心其实觉得效果不会特别好，倒是可以用用其中说到的技术与工具。比如其中用了一个基于LLVM的切片工具[dg
](https://github.com/mchalupa/dg)，目前只有二百多个star，说实话这个工具自从我star后，一直没有真正的尝试着使用过  
恰巧这几天到了阿里猎户实验室他们在NDSS2021上的论文，其中使用clang把XNU的中的AST dump后，形成新的图  
所以现在觉得在源码方面的工作可以以XNU为目标

[Ref]

[CVE-2020-9967 - Apple macOS 6LowPAN Vulnerability](https://alexplaskett.github.io/CVE-2020-9967/)

[Kernel crash caused by out-of-bounds write in Apple's ICMP packet-handling code (CVE-2018-4407)](https://securitylab.github.com/research/apple-xnu-icmp-error-CVE-2018-4407)

[Apple XNU exploits: ICMP proof of concept](https://securitylab.github.com/research/apple-xnu-exploit-icmp-poc)

[CVE-2018-4249 & CVE-2017-13904: Remote code execution in Apple's packet mangler](https://securitylab.github.com/research/CVE-2018-4249-apple-xnu-packet-mangler)

