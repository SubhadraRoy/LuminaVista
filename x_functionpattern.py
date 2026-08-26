def pattern(): 
    for i in range(3,0,-1): 
        for k in range(3,i,-1): 
            print(" ",end="") 
        for f in range(i): 
            print("* ",end="") 
        for k in range(3,i,-1): 
            for j in range(2): 
                print(" ",end="") 
        for f in range(i): 
            print("* ",end="") 
        print() 

    for i in range(3,0,-1): 
        for k in range(3): 
            print(" ",end="") 
        for k in range(3,i,-1): 
            print(" ",end="") 
        for f in range(i): 
            print("* ",end="") 
        print() 

pattern()